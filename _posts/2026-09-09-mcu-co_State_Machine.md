---
layout: post
title: mcu-co How to write a state machine (mcu-co P4)
date: 2026-09-09 09:40:16
description: How to turn a stream of bytes into complete messages with a state machine in C, using the mcu-co frame parser as the example
tags: MCU
categories: mcu-co
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## Introduction

In [P2]({% post_url 2026-03-28-mcu-co_How_to_write_good_Driver %}) I wrote the UART driver that mcu-co uses to talk to the Linux host, and at the end of that post I showed a small state machine as an example of why you would want to read one byte at a time. This post is that idea done properly: the frame parser that mcu-co actually ships.

The problem is this. A UART hands you one byte at a time and tells you nothing else. It does not tell you where a message starts, where it ends, or whether the byte you just received is the middle of a good message or the tail of a corrupted one. All you get is a stream. Somewhere between "a byte arrived" and "a command is ready to execute", something has to reassemble that stream into whole messages, and that something is the frame parser.

There are two ways to go about it. The first is to buffer bytes until you think you have enough, then parse the buffer. This works fine when messages are fixed size, but ours are not, and it means the parsing code has to be able to say "not enough bytes yet, call me again" without losing its place. The second is a **state machine**: you keep a variable saying which field of the message you are expecting next, and each byte that arrives is interpreted according to that variable and then advances it. No buffering of raw bytes, no re-parsing, no blocking waiting for the rest of a message. That is what we will build here.

Everything below is the real `frame_parser` module from the mcu-co firmware, which you can find [here](https://github.com/Causality-Labs/mcu-co_firmware/blob/main/src/frame_parser.c).

## The wire format

Before writing a parser, you need to know what you are parsing. A command frame from the host looks like this:

{% highlight text %}
SOF · OPCODE · LENGTH · PAYLOAD · CRC_L · CRC_H
{% endhighlight %}

- **SOF** is a fixed start-of-frame byte, `0xA5`. It is not data, it is an anchor.
- **OPCODE** says which command this is.
- **LENGTH** is how many payload bytes follow.
- **PAYLOAD** is `LENGTH` bytes of command arguments.
- **CRC_L** and **CRC_H** are a CRC16 over everything except the SOF byte, little-endian.

That is six fields, and every one of them is a state. The parser's whole job is to know which of those six fields the next byte belongs to.

## Data Structures

**frame_state_t**: The states themselves. This enum *is* the state machine — each value is one field of the wire format.

{% highlight c linenos %}
/** @brief Which field of the wire format the next byte belongs to. */
typedef enum
{
    SOF,
    OPCODE,
    LENGTH,
    PAYLOAD,
    CRC_LOW,
    CRC_HIGH
} frame_state_t;
{% endhighlight %}

Naming the states after the fields rather than after step numbers is worth doing. `state = LENGTH` tells you immediately that the next byte is a length; `state = STATE_3` tells you nothing and goes stale the moment the format changes.

**frame_results_t**: What one byte did to the frame being assembled. This is what the caller gets back on every single byte, so it has to distinguish "nothing is happening yet" from "something is happening" from "done".

{% highlight c linenos %}
/** @brief What one byte did to the frame being assembled. */
typedef enum
{
    FRAME_READY,
    FRAME_IN_PROGRESS,
    FRAME_PENDING,
    FRAME_ERROR
} frame_results_t;
{% endhighlight %}

- **FRAME_PENDING**: we are still hunting for a start-of-frame byte, and the byte we just got was thrown away.
- **FRAME_IN_PROGRESS**: the byte was taken into the frame, but the frame is not finished.
- **FRAME_READY**: that byte completed the frame.
- **FRAME_ERROR**: the byte could not be used, and the parser has reset.

The distinction between `FRAME_PENDING` and `FRAME_IN_PROGRESS` looks pedantic but it is not: pending means the link is idle or desynchronized, in progress means a frame is genuinely being assembled. If you collapse the two, you lose the ability to tell "nothing is being sent" from "something is halfway here".

**command_frame_t**: The frame being built, and the parser's state along with it.

{% highlight c linenos %}
/**
 * @brief A command frame under construction, and the parser's state with it.
 *
 * One instance is fed bytes for the life of the link, not one per frame. Start
 * it zeroed with @p state set to ::SOF.
 */
typedef struct
{
    frame_state_t state;
    uint8_t opcode;
    uint8_t length;
    uint8_t payload[RX_MAX_PAYLOAD];
    uint8_t payload_idx;
    uint8_t crc_low;
    uint8_t crc_high;
} command_frame_t;
{% endhighlight %}

Two things to notice here.

First, **the state lives in the struct, not in a `static` variable inside the parser**. This is the single most useful decision in the module. A `static frame_state_t state;` inside `frame_parser_feed()` would work exactly as well for mcu-co, which has one link — right up until you want a second link, or want to test the parser, at which point every test is contaminated by the state the previous test left behind. Putting the state in a caller-owned struct means the parser has no memory of its own: you can have as many parsers as you have links, and a test can create a fresh one for every case.

Second, **the payload buffer is a fixed-size array**, sized by `RX_MAX_PAYLOAD` (32 bytes, comfortably more than the widest command mcu-co has). No `malloc`, no variable-length array. On a bare-metal MCU you want to know at link time exactly how much RAM the parser costs, and a fixed array in a caller-allocated struct gives you that.

**response_frame_t**: The reply side. The parser also builds outgoing frames, so it needs a structure for what a reply carries.

{% highlight c linenos %}
/**
 * @brief A command's reply: an outcome, plus the value a read command returns.
 */
typedef struct
{
    bool ack;
    uint8_t data[TX_DATA_MAX];
    uint8_t data_len;
} response_frame_t;
{% endhighlight %}

`ack` is the outcome, `data` is either the value a read command returned or the one-byte reason a command failed, and `data_len` says how many of those bytes are real. `TX_DATA_MAX` is 4, the width of the widest read the protocol has (a 32-bit frequency).

## The state machine

Here is the whole thing:

{% highlight c linenos %}
frame_results_t frame_parser_feed(command_frame_t *frame, uint8_t data_byte)
{
    if (frame == NULL)
    {
        return FRAME_ERROR;
    }

    switch (frame->state)
    {
    case SOF:
        if (data_byte == SOF_BYTE)
        {
            frame->state = OPCODE;
            return FRAME_IN_PROGRESS;
        }
        else
        {
            return FRAME_PENDING;
        }

    case OPCODE:
        frame->opcode = data_byte;
        frame->state  = LENGTH;

        return FRAME_IN_PROGRESS;

    case LENGTH:
        frame->length = data_byte;

        if (frame->length > RX_MAX_PAYLOAD)
        {
            frame->state = SOF;

            return FRAME_ERROR;
        }
        else if (frame->length == 0U)
        {
            frame->state = CRC_LOW;

            return FRAME_IN_PROGRESS;
        }
        else
        {
            frame->payload_idx = 0;
            frame->state       = PAYLOAD;

            return FRAME_IN_PROGRESS;
        }

    case PAYLOAD:
        frame->payload[frame->payload_idx] = data_byte;
        frame->payload_idx++;

        if (frame->payload_idx == frame->length)
        {
            frame->payload_idx = 0;
            frame->state       = CRC_LOW;
        }

        return FRAME_IN_PROGRESS;

    case CRC_LOW:
        frame->crc_low = data_byte;
        frame->state   = CRC_HIGH;

        return FRAME_IN_PROGRESS;

    case CRC_HIGH:
        frame->crc_high = data_byte;
        frame->state    = SOF;

        return FRAME_READY;

    default:
        frame->state = SOF;

        return FRAME_READY;
    }
}
{% endhighlight %}

That is the entire parser. One switch, one byte in, one result out, no loops and no blocking. Here is what each state is actually doing.

#### SOF

{% highlight c linenos %}
    case SOF:
        if (data_byte == SOF_BYTE)
        {
            frame->state = OPCODE;
            return FRAME_IN_PROGRESS;
        }
        else
        {
            return FRAME_PENDING;
        }
{% endhighlight %}

In this state the parser throws away everything that is not `0xA5`. That sounds wasteful, but it is the property that makes the link recoverable. Suppose the host is halfway through sending a frame and the cable is unplugged, or a byte is lost to noise. The parser is now out of step with the sender and every subsequent byte it interprets will be interpreted as the wrong field. Without a resync rule, it stays wrong forever. With one, the damaged frame eventually fails its CRC or runs to its end, the parser lands back in `SOF`, and it silently discards bytes until the next `0xA5` — which is the start of a real frame. The link heals itself with no intervention from either end.

Notice this state is also the only one that does not store the byte anywhere. `0xA5` is a marker, not data, and it is deliberately *not* covered by the CRC for that reason.

#### OPCODE

Take the byte, store it, move on. Not every state has to be interesting. Worth noting: the parser does **not** check whether the opcode is one it knows. That is the dispatcher's job, and mixing the two would mean teaching the parser about every command in the protocol.

#### LENGTH

{% highlight c linenos %}
    case LENGTH:
        frame->length = data_byte;

        if (frame->length > RX_MAX_PAYLOAD)
        {
            frame->state = SOF;

            return FRAME_ERROR;
        }
{% endhighlight %}

This is the most important five lines in the module. `frame->length` is a byte that came off the wire, from a sender we do not control, and the `PAYLOAD` state is about to use it as the loop bound for writing into a fixed 32-byte array. A `LENGTH` of 200 — from a corrupted byte, or a host bug, or someone poking the link with a serial terminal — would have the parser writing 200 bytes into a 32-byte array and stamping over whatever the linker put after it.

So the rule is: **never trust a length that came off the wire**. Check it against the size of the thing it is going to index, the moment you receive it, before it can be used for anything. And on rejection, go back to `SOF` rather than trying to salvage the frame — a length byte that is nonsense means we are probably not where we think we are in the stream anyway, so the right move is to resync.

The other two branches handle the shape of the frame:

{% highlight c linenos %}
        else if (frame->length == 0U)
        {
            frame->state = CRC_LOW;

            return FRAME_IN_PROGRESS;
        }
        else
        {
            frame->payload_idx = 0;
            frame->state       = PAYLOAD;

            return FRAME_IN_PROGRESS;
        }
{% endhighlight %}

A zero-length frame has no payload at all, so `PAYLOAD` must be skipped entirely. If you fall into `PAYLOAD` with `length == 0`, the exit condition `payload_idx == length` is checked *after* the first byte is written, so the parser would swallow one byte of the CRC as payload and then be permanently one byte out of step. Zero is a legitimate frame shape in this protocol, so it needs an explicit path.

The `payload_idx = 0` in the other branch is the state machine resetting its own scratch variable on the way into the state that uses it, rather than trusting that whoever finished the last frame cleaned up. States that initialize what they need on entry are much harder to break than states that assume.

#### PAYLOAD

{% highlight c linenos %}
    case PAYLOAD:
        frame->payload[frame->payload_idx] = data_byte;
        frame->payload_idx++;

        if (frame->payload_idx == frame->length)
        {
            frame->payload_idx = 0;
            frame->state       = CRC_LOW;
        }

        return FRAME_IN_PROGRESS;
{% endhighlight %}

Every other state consumes exactly one byte and moves on. This one stays put and counts. That is the pattern for any variable-length field: the state does not change until a counter says the field is complete, which is what lets a six-state machine parse a frame of any length between 5 and 37 bytes.

#### CRC_LOW and CRC_HIGH

The two CRC bytes are stored raw and separately, and `CRC_HIGH` is what returns `FRAME_READY` and puts the state back to `SOF` so the next byte starts a new frame.

Note what `FRAME_READY` does **not** mean. It does not mean the frame is good — the parser has not checked the CRC and does not know how. It means the frame is *complete*. Verifying it is a separate step, done by the caller with the helpers below. Keeping "is it whole" separate from "is it correct" is what lets the parser stay a pure state machine with no idea what a CRC is.

#### The state diagram

Put together, the machine looks like this:

{% highlight text linenos%}
             any byte != 0xA5
                 ┌──────┐
                 │      ▼
              ┌──┴──────────┐
    ┌────────►│     SOF     │
    │         └──────┬──────┘
    │                │ 0xA5
    │                ▼
    │         ┌─────────────┐
    │         │   OPCODE    │
    │         └──────┬──────┘
    │                │ any byte
    │                ▼
    │         ┌─────────────┐  LENGTH > RX_MAX_PAYLOAD
    ├─────────┤   LENGTH    ├──────────────────────────►  FRAME_ERROR
    │         └──┬───────┬──┘
    │            │       │ LENGTH == 0
    │  LENGTH>0  │       └──────────────┐
    │            ▼                      │
    │     ┌─────────────┐               │
    │     │   PAYLOAD   │◄──┐           │
    │     └──────┬──────┘   │ idx <     │
    │            │          │ length    │
    │            └──────────┘           │
    │            │ idx == length        │
    │            ▼                      │
    │     ┌─────────────┐◄──────────────┘
    │     │   CRC_LOW   │
    │     └──────┬──────┘
    │            ▼
    │     ┌─────────────┐
    └─────┤   CRC_HIGH  │──►  FRAME_READY
          └─────────────┘
{% endhighlight %}

Every path leads back to `SOF`, whether the frame completed, was rejected, or was never really there. A state machine that can get stuck somewhere with no way back is a state machine that will eventually wedge your link.

## The helpers around it

The state machine assembles frames and nothing else — it does not know what a CRC is, and it never touches the transport. Four small functions in the same module fill the gap between "a frame is complete" and "a frame has been answered":

{% highlight c linenos %}
/* Lay a received frame's CRC-covered bytes out contiguously, so the CRC
 * routine can run over them. Returns 2 + LENGTH, or -1 on bad input. */
int frame_parser_serialize(command_frame_t *frame, uint8_t *serialized_frame_buffer, uint8_t serialized_frame_size);

/* Recombine the frame's two received CRC bytes into one value. */
int frame_parser_get_crc(command_frame_t *frame, uint16_t *crc);

/* Build a response frame's wire bytes, up to but excluding the CRC. */
int frame_parser_serialize_response(response_frame_t *response, uint8_t *serialized_response,
                                    uint8_t serialized_response_size);

/* Append a little-endian CRC to a partly built frame. */
int frame_parser_append_crc(uint8_t *serialized_frame_buffer, uint8_t current_length, uint8_t buffer_size, uint16_t crc);
{% endhighlight %}

The receive pair exists because the parser scattered the frame across struct members, and the CRC has to be computed over those bytes laid out the way they arrived: `frame_parser_serialize` puts OPCODE, LENGTH and PAYLOAD back together contiguously, and `frame_parser_get_crc` reassembles the two CRC bytes the frame carried so the caller has something to compare against.

The transmit pair is the mirror image, and needs no state machine at all — we are the ones producing the bytes, so `frame_parser_serialize_response` writes the whole frame in one go and `frame_parser_append_crc` puts the checksum on the end.

Two habits carry over from the state machine into all four. Each one **validates the length it is about to index with**, even where the state machine already checked it — a function that can write past the end of a buffer should not depend on another function's good behaviour to stay safe. And each **works out how much room it needs, checks the caller's buffer is big enough, and only then writes**, rather than checking as it goes. The one genuinely subtle case is in `frame_parser_append_crc`, where the bounds check adds two `uint8_t` values and has to widen them first — `254 + 2` wraps to `0` in byte arithmetic, which would let the check pass and the write land past the end of the buffer. The [source](https://github.com/Causality-Labs/mcu-co_firmware/blob/main/src/frame_parser.c) has the full implementations if you want them.


## Putting it together

Here is the parser in use, from mcu-co's main loop. This is the whole receive path: pull a byte, feed it, and when a frame completes, verify it and hand it on.

{% highlight c linenos %}
uint8_t data_byte     = 0;
command_frame_t frame = {0};
frame.state           = SOF;

uint8_t serialized_frame[2 + RX_MAX_PAYLOAD] = {0};
uint16_t recv_crc                            = 0;

for (;;)
{
    while (command_transport_receive(&data_byte) == STATUS_OK)
    {
        frame_results_t frame_status = frame_parser_feed(&frame, data_byte);

        if (frame_status == FRAME_READY)
        {
            int serialized_frame_size = frame_parser_serialize(&frame, serialized_frame,
                                                               sizeof(serialized_frame));
            if (serialized_frame_size < 0)
            {
                LOG_ERROR(MODULE_NAME, "frame_parser_serialize() failed (%d)", serialized_frame_size);
                continue;
            }

            if (frame_parser_get_crc(&frame, &recv_crc) < 0)
            {
                LOG_ERROR(MODULE_NAME, "frame_parser_get_crc() failed.");
                continue;
            }

            uint16_t crc_computed = crc16_compute(serialized_frame, (uint8_t)serialized_frame_size);
            if (crc16_compare(crc_computed, recv_crc) != true)
            {
                LOG_INFO(MODULE_NAME, "CRC error: computed 0x%04x, received 0x%04x",
                         crc_computed, recv_crc);
                continue;
            }

            /* frame is complete and verified - hand it to the dispatcher */
        }
    }
}
{% endhighlight %}

The shape of that loop is the point. `frame_parser_feed` is called on every byte and returns immediately every time; the expensive work only happens on the one byte in 5-to-37 that finishes a frame. Nothing blocks, nothing waits, and the main loop is free to do other things between bytes. That is what you buy with a state machine.

Notice also what happens on a bad CRC: `continue`, and nothing else. No reply, no error frame. A frame that failed its CRC has an opcode we cannot trust either, so there is nothing sensible to say about it — and the parser is already back in `SOF`, ready for the next one.

## General trends

The things worth taking from this module into your own state machine:

- **Name states after what they mean**, not what order they happen in.
- **Keep the state in a caller-owned struct**, not in a `static` inside the module. It costs nothing and it is the difference between a testable module and an untestable one.
- **Every state must have a path back to the start.** A machine that can wedge will wedge.
- **Have a resync anchor.** One byte value that only ever means "a message starts here" turns a desynchronized link from a permanent failure into a hiccup.
- **Validate any length that came off the wire before you index with it**, in the state that receives it, and again in any function that uses it as a bound.
- **Separate "complete" from "correct".** The parser assembles; something else validates. Each one stays simple that way.
- **Return a result for every byte**, not a boolean. "Nothing yet", "in progress", "done" and "that was wrong" are four different things to the caller.

In the next post I will cover what happens to the frame after it has been verified: the command dispatcher that turns an opcode into an action.
