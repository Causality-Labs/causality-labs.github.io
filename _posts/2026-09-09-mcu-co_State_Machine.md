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

In this post we are going to learn about one of the most common embedded software design paradigms, the **state machine**. A state machine is computational model that represents a system with a finite number of distinct states, where the system can transition between those states based on specific inputs or events.

- Mealy state machine: In a Mealy state machine the output depends on both the current state AND the input received. The output is determined by examining what state you're in AND what data arrives at that state.

- Moore state machine: In a Moore state machine the output depends ONLY on the current state. Whenever you enter a state, the output is fixed and predetermined, regardless of which input caused the transition to that state.

In mcu-co we need a frame parser to parse the incoming protocol coming from our Linux Host on the UART wire. We can use a Mealy state machine to do this! It would have to be a Mealy state machine because the parser's output depends on both the current state AND the incoming byte.

I will focus on how to implement a Mealy state machine in embedded C for a common application. To learn more about the theory of state machines, see [here](https://en.wikipedia.org/wiki/Finite-state_machine).

For reference the completed frame parser used in mcu-co can be found [here](https://github.com/Causality-Labs/mcu-co_firmware/blob/main/src/frame_parser.c).

## Protocol

Before writing a parser, you need to know what you are parsing. A command frame from the host looks like this:

{% highlight text %}
SOF · OPCODE · LENGTH · PAYLOAD · CRC_L · CRC_H
{% endhighlight %}

- **SOF** is a fixed start-of-frame byte.
- **OPCODE** says which command this is.
- **LENGTH** is how many payload bytes follow.
- **PAYLOAD** is `LENGTH` bytes of command arguments.
- **CRC_L** and **CRC_H** are a CRC16 over everything except the SOF byte, little-endian.

That is six fields, and every one of them is a state. The parser's whole job is to know which of those six fields the next byte belongs to.

## Common Guideline for State Machines in Embedded C

The state machines used in Embedded C follow a certain structure they all include the following:

- **State Enumeration**: an enum of every state:

{% highlight c linenos %}
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

- **State Varaible**: A variable that tracks which state the machine is currently in, int this case it will be the state member in out command_frame_t struct.

{% highlight c linenos %}
typedef struct
{
    frame_state_t state; // Variable that tracks the state.
    uint8_t opcode;
    uint8_t length;
    uint8_t payload[RX_MAX_PAYLOAD];
    uint8_t payload_idx;
    uint8_t crc_low;
    uint8_t crc_high;
} command_frame_t;
{% endhighlight %}


- **Inputs/Events**: a Mealy machine transitions based on its current state *and* an input or event. Here the input is the byte itself, and the event is what that byte turns out to be, such as `data_byte == SOF_BYTE`.


- **Transition Function**: one `switch` on the current state that consumes input and updates it:

{% highlight c linenos %}
frame_results_t frame_parser_feed(command_frame_t *frame, uint8_t data_byte)
{
    switch (frame->state)
    {
    case SOF:
        /* ... */

    case OPCODE:
        /* ... */

    case LENGTH:
        /* ... */

    case PAYLOAD:
        /* ... */

    case CRC_LOW:
        /* ... */

    case CRC_HIGH:
        /* ... */

    default:
        /* ... */
    }
}
{% endhighlight %}

All state machines follow this structure and you extend it for your specific application!


## Data Structures

This is an overview of the data structures used for the frame-parser in mcu-co.

**frame_state_t**: The states themselves. This enum *is* the state machine, and each value is one field of the wire format.

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


**frame_results_t**: What one byte did to the frame being assembled. This is what the caller gets back on every single byte, so it has to distinguish "nothing is happening yet" from "something is happening" from "done".

{% highlight c linenos %}
/** @brief What one byte did to the frame being assembled. */
typedef enum
{
    FRAME_PENDING,
    FRAME_IN_PROGRESS,
    FRAME_READY,
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

In this state the parser is just waiting until it receives the start-of-frame byte, `0xA5`. This lets us ignore noise and ensures we only start parsing incoming data once a start-of-frame byte has been sent.

#### OPCODE

{% highlight c linenos %}
    case OPCODE:
        frame->opcode = data_byte;
        frame->state  = LENGTH;

        return FRAME_IN_PROGRESS;
{% endhighlight %}

This state is very simple: we save the incoming byte as the opcode, update to the next state, and move on.

#### LENGTH

{% highlight c linenos %}
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
{% endhighlight %}

In this state we expect the next incoming byte to be the length of the payload. We must also verify that this is a valid payload length. If it's invalid, we change the state back to `SOF`.

0 is also a valid length. In that case we skip the payload state entirely and move straight into `CRC_LOW`. If the length is valid and nonzero, we update the state to `PAYLOAD` and initialize the payload index.


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

The payload state is straightforward: we copy `frame->length` bytes into `frame->payload`. Once `frame->payload_idx == frame->length`, we reset the payload index and move to the next state, `CRC_LOW`.


#### CRC_LOW and CRC_HIGH

{% highlight c linenos %}
    case CRC_LOW:
        frame->crc_low = data_byte;
        frame->state   = CRC_HIGH;

        return FRAME_IN_PROGRESS;

    case CRC_HIGH:
        frame->crc_high = data_byte;
        frame->state    = SOF;

        return FRAME_READY;
{% endhighlight %}

These two states are identical in shape. In `CRC_LOW` we store the byte as `crc_low` and move to `CRC_HIGH`; in `CRC_HIGH` we store the byte as `crc_high`, move the state back to `SOF`, and let the caller know the frame is ready by returning `FRAME_READY`.


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
