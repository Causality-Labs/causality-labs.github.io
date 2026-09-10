---
layout: post
title: mcu-co How to write a command dispatcher (mcu-co P5)
date: 2026-09-09 10:40:16
description: How to route commands to their handlers with a table of function pointers instead of a giant switch statement, using the mcu-co command dispatcher as the example
tags: MCU
categories: mcu-co
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## Introduction

In [P4]({% post_url 2026-09-09-mcu-co_State_Machine %}) I wrote the state machine that turns the byte stream coming off the UART into complete command frames, and the post ended at the point where a frame has been assembled and its CRC checked. We have a verified frame in hand: an opcode, a length, and a payload. Now something has to look at that opcode, work out which piece of the firmware owns it, call it with the payload, and turn whatever comes back into a reply for the host.

That is the **command dispatcher**, and it is the layer where a protocol either stays maintainable or turns into a swamp. mcu-co has thirteen commands today and will have more later; every one of them needs routing, argument forwarding, a success reply, a failure reply, and a log line. The interesting question is not how to do that for one command, it is how to do it for thirty without writing the same six lines thirty times.

This post covers the dispatcher mcu-co actually ships, which you can find [here](https://github.com/Causality-Labs/mcu-co_firmware/blob/main/src/command_dispatcher.c).

## The obvious approach, and why I didn't use it

The first thing anyone writes is a switch statement:

{% highlight c linenos %}
switch (frame->opcode)
{
case GPIO_CFG:
    ret = gpio_controller_io_cfg(frame->payload, frame->length);
    if (ret != STATUS_OK)
    {
        LOG_ERROR(MODULE_NAME, "gpio cfg failed: %s", status_to_str(ret));
        resp->ack      = false;
        resp->data[0]  = (uint8_t)ret;
        resp->data_len = 1U;
        return ret;
    }
    resp->ack      = true;
    resp->data_len = 0U;
    return STATUS_OK;

case GPIO_WRITE:
    ret = gpio_controller_write(frame->payload, frame->length);
    if (ret != STATUS_OK)
    {
        /* ...the same nine lines again, with a different string... */
    }

/* ...and eleven more of these... */
}
{% endhighlight %}

This works. It is also a lot of near-identical code, and every one of those copies is a place where the error handling can drift out of line with the others. Miss a `resp->ack = false` in one branch and that one command starts NACKing with a stale ACK flag. Add a new status code and you have thirteen places to think about.

The pattern that fixes this is a **dispatch table**: instead of thirteen branches that each do the same thing to a different function, you have one branch that does that thing, and a table of data saying which function each opcode maps to. The routing becomes data, and data is much easier to keep correct than repeated code.

## Data Structures

**The handler signatures**: Before you can put functions in a table, they have to share a type. mcu-co's commands come in two shapes, so there are two:

{% highlight c linenos %}
typedef status_t (*command_action_fn)(const uint8_t *payload, uint8_t length);
typedef status_t (*command_read_fn)(const uint8_t *payload, uint8_t length, uint32_t *value);
{% endhighlight %}

`command_action_fn` reads as "pointer to a function taking a payload and a length, returning a `status_t`" — any function with that exact signature can be stored in a variable of this type and called through it.

An **action** does something — configure a pin, drive it high, set a duty cycle — and reports only whether it worked. A **read** also produces a value the host asked for. Those are genuinely different shapes, and trying to force them into one signature (by giving actions an unused output parameter) would put a pointless argument on every handler in the firmware.

Notice the read signature reports through a `uint32_t` even though the widest thing any read actually returns is a 32-bit frequency and the narrowest is a single bool. That is deliberate, and I will come back to it.

**command_entry_t**: One row of the table — everything the dispatcher needs to know about one opcode.

{% highlight c linenos %}
/**
 * @brief One opcode's routing: which controller call it makes, and how wide a
 *        reply that call produces.
 *
 * A command either acts (@p action) or reads (@p read), never both, so exactly
 * one of the two is set. Read handlers all report through a @c uint32_t so a
 * single call site serves every read width; @p data_len is the width the
 * protocol fixes for that opcode's ACK, and 0 for an action. @p name is the
 * subject of the failure log, which keeps one log site instead of one per
 * opcode.
 *
 * Pointers lead and the two bytes trail so the struct packs without padding;
 * rows use designated initializers to keep the opcode reading first anyway.
 */
typedef struct
{
    command_action_fn action;
    command_read_fn read;
    const char *name;
    uint8_t opcode;
    uint8_t data_len;
} command_entry_t;
{% endhighlight %}

Five fields, and each one exists to delete a copy of something:

- **action** / **read**: the routing itself. Exactly one is set; the other stays `NULL`, which is how the dispatcher tells the two shapes apart at run time.
- **name**: a human-readable string for the log. Because it lives in the row, there is **one** log statement in the whole module instead of one per opcode.
- **opcode**: the byte from the wire that selects this row.
- **data_len**: how many bytes this opcode's ACK carries. `0` for an action, `1` for a pin state, `2` for a duty, `4` for a frequency. The protocol fixes this per opcode, so it belongs in the table next to the opcode rather than being worked out at the call site.

**The table**: And here is the routing for the entire protocol.

{% highlight c linenos %}
static const command_entry_t COMMAND_TABLE[] = {
    {.opcode = GPIO_CFG, .action = gpio_controller_io_cfg, .data_len = 0U, .name = "gpio cfg"},
    {.opcode = GPIO_WRITE, .action = gpio_controller_write, .data_len = 0U, .name = "gpio write"},
    {.opcode = GPIO_READ, .read = read_gpio_pin, .data_len = 1U, .name = "gpio read"},
    {.opcode = GPIO_IRQ_BIND, .action = gpio_controller_irq_bind, .data_len = 0U, .name = "gpio irq bind"},
    {.opcode = GPIO_IRQ_CFG, .action = gpio_controller_irq_cfg, .data_len = 0U, .name = "gpio irq cfg"},
    {.opcode = GPIO_IRQ_UNBIND, .action = gpio_controller_irq_unbind, .data_len = 0U, .name = "gpio irq unbind"},
    {.opcode = PWM_GROUP_CFG, .action = pwm_controller_group_cfg, .data_len = 0U, .name = "pwm group cfg"},
    {.opcode = PWM_CHANNEL_CFG, .action = pwm_controller_channel_cfg, .data_len = 0U, .name = "pwm channel cfg"},
    {.opcode = PWM_CHANNEL_SET, .action = pwm_controller_channel_set, .data_len = 0U, .name = "pwm channel set"},
    {.opcode = PWM_CHANNEL_RELEASE, .action = pwm_controller_channel_release, .data_len = 0U, .name = "pwm channel release"},
    {.opcode = PWM_CHANNEL_GET, .read = read_pwm_duty, .data_len = 2U, .name = "pwm channel get"},
    {.opcode = PWM_GROUP_GET, .read = pwm_controller_group_get, .data_len = 4U, .name = "pwm group get"},
    {.opcode = PWM_GROUP_RELEASE, .action = pwm_controller_group_release, .data_len = 0U, .name = "pwm group release"},
};

#define COMMAND_TABLE_LEN (sizeof(COMMAND_TABLE) / sizeof(COMMAND_TABLE[0]))
{% endhighlight %}

The entire protocol is now readable in one screen. Adding a command is one line; you cannot forget the error handling, because there is no error handling to write.

Three small habits make that table cheap and hard to break: `static const` keeps it in flash instead of RAM and stops a stray pointer rewriting our routing; the designated initializers (`.opcode = ...`) let every row read opcode-first no matter how the struct is laid out, with the unused function pointer simply absent; and `COMMAND_TABLE_LEN` is computed with `sizeof(table) / sizeof(table[0])` rather than hand-maintained, so adding a row cannot leave a stale count behind.

## The adapters

Two rows point at functions that are not controller functions: `read_gpio_pin` and `read_pwm_duty`. They exist because the controllers report values in their natural types — a `bool` for a pin, a `uint16_t` for a duty — while the table's read signature reports through a `uint32_t`:

{% highlight c linenos %}
/* gpio_controller_read() reports a bool, which the table's single read
 * signature widens to uint32_t so all read opcodes share one call site. */
static status_t read_gpio_pin(const uint8_t *payload, uint8_t length, uint32_t *value)
{
    bool pin_state = false;

    status_t ret = gpio_controller_read(payload, length, &pin_state);
    if (ret == STATUS_OK)
    {
        *value = pin_state ? 1U : 0U;
    }

    return ret;
}
{% endhighlight %}

This is the trade the table asks you to make. To have one call site handle every read, every read has to have the same signature; where a controller does not, you write a five-line adapter rather than bending the controller's API to suit the dispatcher. The alternative — making `gpio_controller_read` report a `uint32_t` because the dispatcher finds that convenient — pushes the protocol's shape down into a module that should not know the protocol exists. `pwm_controller_group_get` already reports a `uint32_t` frequency, so it needs no adapter and goes straight into the table.

## The helpers

Three small static functions sit between the table and the dispatcher, and none of them is more than a few lines:

- **`find_command`** walks the table and returns the row whose opcode matches, or `NULL`. A linear scan over thirteen rows, once per command, on a link that is strictly one command at a time — a direct-index array or a binary search would buy complexity where there is no problem.
- **`store_le`** writes a read's value into the reply as little-endian bytes, using shifts rather than a `memcpy` of the `uint32_t` so the result does not depend on the endianness of whatever we compile for. Its loop is bounded by both the requested width and `TX_DATA_MAX`, so a bad `data_len` in a future table row cannot walk off the end of the 4-byte array.
- **`reply_nack`** builds the failure reply — `ack = false`, one data byte carrying the reason — and *returns* that reason:

{% highlight c linenos %}
static status_t reply_nack(response_frame_t *resp, status_t reason)
{
    resp->ack      = false;
    resp->data[0]  = (uint8_t)reason;
    resp->data_len = 1U;

    return reason;
}
{% endhighlight %}

Returning the reason is the neat part: every failure site in the dispatcher becomes a single line, `return reply_nack(resp, ret);`, so the reply gets built and the status gets propagated in one statement and there is no way to do one and forget the other.

Putting the failing `status_t` in the reply is also what makes the protocol pleasant to use from the host side. A bare "no" leaves the host guessing whether it sent a bad pin number, asked for a pin someone else owns, or hit a peripheral that was never initialised. Sending the reason costs one byte.


## The dispatcher

Everything above exists so that this function can be short:

{% highlight c linenos %}
status_t dispatch_command(command_frame_t *frame, response_frame_t *resp)
{
    if (frame == NULL)
    {
        LOG_ERROR(MODULE_NAME, "Frame data structure is null");
        return STATUS_ERR_INVALID_ARG;
    }

    if (resp == NULL)
    {
        LOG_ERROR(MODULE_NAME, "Response data structure is null");
        return STATUS_ERR_INVALID_ARG;
    }

    resp->ack      = false;
    resp->data_len = 0U;

    const command_entry_t *entry = find_command(frame->opcode);
    if (entry == NULL)
    {
        LOG_ERROR(MODULE_NAME, "unknown opcode 0x%02x", frame->opcode);
        return reply_nack(resp, STATUS_ERR_UNSUPPORTED);
    }

    uint32_t response = 0U;
    status_t ret;

    if (entry->read != NULL)
    {
        ret = entry->read(frame->payload, frame->length, &response);
    }
    else
    {
        ret = entry->action(frame->payload, frame->length);
    }

    if (ret != STATUS_OK)
    {
        LOG_ERROR(MODULE_NAME, "%s failed: %s", entry->name, status_to_str(ret));
        return reply_nack(resp, ret);
    }

    store_le(resp->data, response, entry->data_len);
    resp->data_len = entry->data_len;
    resp->ack      = true;

    return STATUS_OK;
}
{% endhighlight %}

Thirteen commands, forty lines, and adding the fourteenth does not touch any of them. Walking through it:

**The reply is initialised to a failure before anything else happens.** `ack = false`, `data_len = 0`. If any path through this function forgets to populate the reply, the caller sends a bare NACK, which is a safe and truthful thing to send. Initialising to the failure case rather than the success case means a bug produces a refusal rather than a false confirmation.

**The two NULL checks are the only paths that leave `resp` untouched**, which is documented in the header, and it is why the main loop is allowed to send `resp` without inspecting the return value on any other path.

**`entry->read != NULL` is the discriminator.** The row does not carry a "what kind of command is this" enum, because it does not need one: exactly one of the two function pointers is set, so the one that is set *is* the answer. A separate type field would be a second source of truth that could disagree with the pointers.

**One call site per shape, one log site in total.** The `LOG_ERROR` uses `entry->name`, so every command in the protocol gets a named failure log without a single per-command log statement. This is the payoff for putting the name in the table.

**`data_len` is set from the table only after the status is known good.** This ordering matters more than it looks. A read that fails must reply with one reason byte, not with the four bytes its opcode's ACK would normally carry — otherwise the host is told to expect four bytes and gets one. Because `reply_nack` returns early and sets `data_len = 1` itself, and the table's `data_len` is only applied on the success path, a failed wide read cannot mislead the host about the frame size. There is a test that pins this exact behaviour down, which I will show in the next post.

## Putting it together

In the main loop, the dispatcher sits between the verified frame and the response serialiser:

{% highlight c linenos %}
/* {0} leaves ack false, so this is already a valid NACK if
 * dispatch_command() returns before populating it. */
response_frame_t resp = {0};
status_t disp_status  = dispatch_command(&frame, &resp);

if (disp_status != STATUS_OK)
{
    /* No continue: the host is waiting on a reply, and resp is
     * a populated NACK on every dispatch failure path. */
    LOG_ERROR(MODULE_NAME, "dispatch_command() failed (%s), sending NACK", status_to_str(disp_status));
}

int response_len = frame_parser_serialize_response(&resp, response_frame, sizeof(response_frame));
{% endhighlight %}

That comment is the important one. A failed dispatch does **not** `continue` — it falls through and sends the reply anyway. The host is sitting there waiting for an answer to the command it sent, and a NACK with a reason is an answer. Staying silent because something went wrong is the one response the protocol has no way to interpret; the host would just time out, knowing nothing.

Compare that with the CRC failure in [P4]({% post_url 2026-09-09-mcu-co_State_Machine %}), where the right move *was* to stay silent. The difference is whether we know what we are replying to. A CRC failure means the opcode itself is untrustworthy; a dispatch failure means we understood the command perfectly and are refusing it for a reason we can name.

## General trends

- **Turn repetition into data.** If your routing is thirteen copies of the same shape, the shape belongs in code once and the differences belong in a table.
- **Put the log subject in the table.** One `LOG_ERROR` with `entry->name` beats thirteen hand-written ones that will drift.
- **Let the data answer the question.** Two function pointers where exactly one is set need no "type" field; the set one is the type.
- **Initialise replies to failure.** A missed assignment then produces a refusal, not a false success.
- **Always answer.** Once you have understood a command well enough to refuse it, tell the host why. Silence is only correct when you cannot trust what you received.
- **Do not optimise a lookup that runs once per command.** A linear scan of thirteen rows is not the bottleneck on a serial link, and pretending otherwise buys complexity with nothing.

In the next post I will cover how all of this gets tested — on a PC, with no board plugged in — using CppUTest, fakes, and spies.
