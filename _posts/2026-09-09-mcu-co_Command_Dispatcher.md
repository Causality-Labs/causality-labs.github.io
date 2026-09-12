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

In this post we will go over the **command dispatcher**. In super simple terms, a command dispatcher is a function that takes a command as input and calls the appropriate handler function to execute it. It is a very common design paradigm in embedded systems, or in programming in general. Here are some common applications for it:

- Serial communication: Host sends commands over UART → dispatcher executes them
- CLI interfaces: Parsing text input from a debug terminal
- Message handling: Processing messages from a queue or interrupt handler
- Task scheduling: Dispatching different operations based on command IDs

In mcu-co we are using the serial communication approach: we get a command on the UART bus, look at its opcode, and dispatch the function tied to that opcode. In this post I will go over how I designed the command dispatcher to fit mcu-co's needs. The full implementation can be found [here](https://github.com/Causality-Labs/mcu-co_firmware/blob/main/src/command_dispatcher.c).

## High Level Overview

{% include figure.liquid path="assets/img/mcu-co/mcu-co_command_dispatch.png" class="img-fluid rounded z-depth-1" zoomable=true %}

The block diagram above illustrates the purpose of the command dispatcher: it takes in command frames built by the frame parser and passes a payload (the controller instructions) to the GPIO and PWM controllers.

## Data Structures

These are the data structures I created for use in the command dispatcher module.

The first data structure to bring up is the **function pointer**: a variable that stores the address of a function, allowing you to call that function indirectly through the pointer instead of calling it by name. We will use function pointers in the command dispatcher to map commands to their handler functions in a lookup table. By doing this we can avoid large switch statements and large if/else blocks. It also makes it easy to add new commands without changing the dispatcher logic. Below is the syntax used for function pointers:

{% highlight c linenos %}
// Function that returns a value
int add(int a, int b) {
    return a + b;
}

// Function pointer that returns int
int (*func_ptr)(int, int);

// Assign and call with arguments
func_ptr = add;
int result = func_ptr(5, 3);  // result = 8
printf("Result: %d\n", result);
{% endhighlight %}

Above is an example of a function pointer in use. Read the declaration inside-out: `func_ptr` is a pointer (`*`) to a function taking `(int, int)` and returning `int`. Once declared you can set it to a function with the same declaration and then use it as seen above.

In mcu-co we have two different types of functions to base our function pointers on: action functions and read functions. Action functions take two inputs — the address of a buffer and the length of the buffer. Read functions take those same two inputs plus a pointer to a value, since a read has to place the result it finds somewhere. Below you can see the action function pointer and the read function pointer:

{% highlight c linenos %}
typedef status_t (*command_action_fn)(const uint8_t *payload, uint8_t length);
typedef status_t (*command_read_fn)(const uint8_t *payload, uint8_t length, uint32_t *value);
{% endhighlight %}

Both lines follow the same pattern, just wrapped in `typedef` so we can reuse the type by name instead of retyping the pointer syntax everywhere:

- `typedef` — we're naming a type, not declaring a variable.
- `status_t` — the return type the function must have.
- `(*command_action_fn)` — the name of the new type, marked as a pointer with `*`.
- `(const uint8_t *payload, uint8_t length)` — the parameter list the function must match.

So `command_action_fn` is now a type: "pointer to a function that takes `(const uint8_t *, uint8_t)` and returns `status_t`." `command_read_fn` is the same idea with one extra parameter, `uint32_t *value`, for the result. Any function matching one of these signatures can be assigned to a variable of that type and stored in the table below.

The next data structure is `command_entry_t`, which is one entry in our command dispatcher table. It contains the following fields:
{% highlight c linenos %}
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
- **name**: a human-readable string for logging purposes.
- **opcode**: the byte from the wire that selects this row.
- **data_len**: how many bytes this opcode's response carries.

The last data structure needed is the command table itself: an array of `command_entry_t` rows, one per opcode.
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

This is the trade the table asks you to make. To have one call site handle every read, every read has to have the same signature; where a controller does not, you write a five-line adapter rather than bending the controller's API to suit the dispatcher.

## The helpers

Three small static functions sit between the table and the dispatcher, and none of them is more than a few lines:

- **`find_command`** walks the table and returns the row whose opcode matches, or `NULL`. A linear scan over thirteen rows, once per command, on a link that is strictly one command at a time — a direct-index array or a binary search would buy complexity where there is no problem.

{% highlight c linenos %}
static const command_entry_t *find_command(uint8_t opcode)
{
    for (size_t i = 0U; i < COMMAND_TABLE_LEN; i++)
    {
        if (COMMAND_TABLE[i].opcode == opcode)
        {
            return &COMMAND_TABLE[i];
        }
    }

    return NULL;
}
{% endhighlight %}


- **`store_le`** writes a read's value into the reply as little-endian bytes, using shifts rather than a `memcpy` of the `uint32_t` so the result does not depend on the endianness of whatever we compile for. Its loop is bounded by both the requested width and `TX_DATA_MAX`, so a bad `data_len` in a future table row cannot walk off the end of the 4-byte array.

{% highlight c linenos %}
static void store_le(uint8_t *data, uint32_t value, uint8_t width)
{
    for (uint8_t i = 0U; (i < width) && (i < TX_DATA_MAX); i++)
    {
        data[i] = (uint8_t)((value >> (8U * i)) & 0xFFU);
    }
}
{% endhighlight %}

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


## Putting it together

In the main loop, the dispatcher sits between the verified frame and the response serialiser:

{% highlight c linenos %}
/* {0} leaves ack false, so this is already a valid NACK if
 * dispatch_command() returns before populating it. */
response_frame_t resp_frame = {0};
status_t disp_status  = dispatch_command(&command_frame, &resp_frame);

if (disp_status != STATUS_OK)
{
    /* No continue: the host is waiting on a reply, and resp is
     * a populated NACK on every dispatch failure path. */
    LOG_ERROR(MODULE_NAME, "dispatch_command() failed (%s), sending NACK", status_to_str(disp_status));
}
{% endhighlight %}
