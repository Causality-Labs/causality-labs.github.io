---
layout: post
title: mcu-co How to create a shared library in Linux (mcu-co P8)
date: 2026-09-19 00:00:00
description: What a shared library is on Linux and how to design a C API around one, using the mcu-co SDK as the example
tags: MCU Linux
categories: mcu-co
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## Introduction

In this post we will go over what a shared library is in Linux, and how the mcu-co SDK uses one to expose an API that applications can use to interface with the mcu-co microcontroller.

I decided to use a shared library for mcu-co because without it every application would have to reimplement the serial protocol, frame parsing, and CRC handling itself. A shared library means that work is done once: the library owns the serial link and speaks the protocol, and every application on the host links against it and gets that logic for free, calling a plain C function instead of assembling frames by hand.

#### What is a shared library

A shared library (`.so` on Linux) is compiled code that stays separate from your executable and gets linked in at runtime instead of build time, so any number of running programs can share the same copy of it. The alternative is a static library (`.a`), which is copied straight into your binary at link time. A few things that follow from that:

- **Binary size**: static bakes the library into every executable that uses it; shared keeps one copy on disk that everything references.
- **Updates**: fix a bug in a shared library and every program using it picks up the fix on next run, no rebuild needed. Static means rebuilding and redistributing.
- **Memory**: processes using the same `.so` share one copy of its code in RAM; static duplicates that code in every process.
- **Runtime dependency**: a shared library has to be present on the machine when the program runs, or it fails to start. A static binary is self-contained.

The source for the library is [here](https://github.com/Causality-Labs/mcu-co_sdk).


## The public header

In order to use the mcuco library you must inlcude the public header in upit program like this :
{% highlight c linenos %}
#include "mcuco.h"
{% endhighlight %}

If you opened up that header you will be greeted with the data structures and API's that the library gives you access to interface with the microcontroller some of then are seen below:

{% highlight c linenos %}
/* Not thread-safe: the protocol allows one command in flight. */
typedef struct mcuco mcuco_t;

const char *mcuco_strerror(mcu_status_t status);

/* Returns NULL on failure with errno set, as fopen does. */
mcuco_t *mcuco_open(const char *device_path, int timeout_ms);

/* Closes the port and frees the handle. A NULL mcu is ignored. */
void mcuco_close(mcuco_t *mcu);

/* Confirms mcu-co, not just any device, is on the other end. Wrong magic in
 * an otherwise valid reply fails with STATUS_ERR_BAD_FRAME. */
mcu_status_t mcuco_probe(mcuco_t *mcu);

/* Reboots the MCU. STATUS_OK only means the request landed; the link then
 * goes down. Close this handle and open a fresh one once it has booted. */
mcu_status_t mcuco_reset(mcuco_t *mcu);
{% endhighlight %}

`mcuco_t` is declared but never defined in the header, which makes it an opaque pointer. An opaque pointer is a pointer to a type whose definition the caller can not see. This means the caller can hold and pass the pointer but can not derefrence it or know it's size. Here is what the actual mcuco struct looks like which is defined in mcuco.c:
{% highlight c linenos %}
struct mcuco
{
    int fd;
    int timeout_ms;
};
{% endhighlight %}

The rest of the functions above deal with the life time cycle of the mcuco_t data structure

- `mcuco_t *mcuco_open(const char *device_path, int timeout_ms)`: Opens the serial port, allocates the handle, and hands it back. It returns `NULL` with `errno` set rather than a status code, because there is no handle yet to report a status through. It also probes before returning, so if the device on the other end of that path is not mcu-co you get a failure here instead of a handle that only breaks on your first real command.
- `void mcuco_close(mcuco_t *mcu)`: Closes the port and frees the handle. It ignores a `NULL`, the way `free()` does, so an error path can call it without guarding first.
- `mcu_status_t mcuco_probe(mcuco_t *mcu)`: Asks the MCU to identify itself and checks the reply carries the right magic bytes. `mcuco_open` already does this for you, so calling it directly is for re-checking a link that has been idle, or for telling "the board is gone" apart from "the board said no" after something failed.
- `mcu_status_t mcuco_reset(mcuco_t *mcu)`: Reboots the MCU, which is how you hand the pins back to a known state. The MCU keeps driving whatever it was last told to until it is reset, so closing the handle on its own leaves your outputs live. `STATUS_OK` here only means the request landed: the link goes down right after, and the handle is dead. Close it and open a fresh one once the MCU has booted.
- `const char *mcuco_strerror(mcu_status_t status)`: Turns any status code into a readable string, so a caller never has to keep its own table of error messages.


## Using the library

#### The API surface

There is one function per command in the protocol, and they group into three families:

{% highlight c linenos %}
/* GPIO */
mcu_status_t mcuco_gpio_cfg(mcuco_t *mcu, dir_t dir, port_t port, uint8_t pin);
mcu_status_t mcuco_gpio_set(mcuco_t *mcu, level_t level, port_t port, uint8_t pin);
mcu_status_t mcuco_gpio_get(mcuco_t *mcu, port_t port, uint8_t pin, level_t *level);
mcu_status_t mcuco_gpio_toggle(mcuco_t *mcu, port_t port, uint8_t pin, level_t *level);

/* Interrupts */
mcu_status_t mcuco_gpio_irq_cfg(mcuco_t *mcu, edge_t edge, port_t port, uint8_t pin);
mcu_status_t mcuco_gpio_irq_bind(mcuco_t *mcu, edge_t edge, port_t in_port, uint8_t in_pin,
                                 action_t action, port_t out_port, uint8_t out_pin);
mcu_status_t mcuco_gpio_irq_unbind(mcuco_t *mcu, port_t port, uint8_t pin);

/* PWM */
mcu_status_t mcuco_pwm_group_cfg(mcuco_t *mcu, uint32_t freq_hz, uint8_t group);
mcu_status_t mcuco_pwm_channel_cfg(mcuco_t *mcu, polarity_t polarity, port_t port, uint8_t pin);
mcu_status_t mcuco_pwm_channel_set(mcuco_t *mcu, uint16_t duty, port_t port, uint8_t pin);
{% endhighlight %}


#### The implementation

Lets a take a look at `mcuco_gpio_set` as the other functions follow a similar structure:

{% highlight c linenos %}
mcu_status_t mcuco_gpio_set(mcuco_t *mcu, level_t level, port_t port, uint8_t pin)
{
    if (mcu == NULL)
    {
        return STATUS_ERR_ARG;
    }

    uint8_t frame[PROTOCOL_MAX_COMMAND_FRAME];
    ssize_t frame_len = protocol_gpio_set(level, port, pin, frame, sizeof(frame));

    return exchange(mcu, frame, frame_len, NULL);
}
{% endhighlight %}

`protocol_gpio_set` validates the arguments and builds the frame, returning either a length or a negative status code. `exchange` writes the frame, waits for one response, and turns a NACK into a return value. Every other command in the library is this same shape, which is what you want: the interesting logic lives in one place and the API layer is just a thin, boring translation.

#### A worked example

`examples/blink.c` is the shortest thing that does something visible. Open the port, configure PA5 as an output, and toggle it:

{% highlight c linenos %}
mcuco_t *mcu = mcuco_open(device_path, MCUCO_TIMEOUT_DEFAULT_MS);
if (mcu == NULL)
{
    perror("mcuco_open");
    return 1;
}

mcu_status_t status = mcuco_gpio_cfg(mcu, DIR_OUTPUT, PORT_A, 5);
if (status != STATUS_OK)
{
    fprintf(stderr, "%s\n", mcuco_strerror(status));
    return 1;
}

while (!stop_requested)
{
    status = mcuco_gpio_set(mcu, LEVEL_HIGH, PORT_A, 5);
    if (status != STATUS_OK)
    {
        fprintf(stderr, "%s\n", mcuco_strerror(status));
        break;
    }
    sleep(1);

    status = mcuco_gpio_set(mcu, LEVEL_LOW, PORT_A, 5);
    if (status != STATUS_OK)
    {
        fprintf(stderr, "%s\n", mcuco_strerror(status));
        break;
    }
    sleep(1);
}

mcuco_reset(mcu);
mcuco_close(mcu);
{% endhighlight %}

By shipping the mcuco library the user does not have to worry about the low level deatils of interfacing with the microcontroller like setting up the uart bus, protocol parsing andd CRC checks. Instead they just have to include the header and call the API's they need. If there is an error it is returned with the `mcu_status_t` status which they can make human readable with the `mcuco_strerror` function.

One thiing worth noting is that when you are about to end the program one must call `mcuco_reset` and `mcuco_close`. The MCU keeps driving whatever it was last told to drive, so closing the handle does not turn the LED off. Resetting hands the pins back to a known state before the link goes down.

#### Linking against it

The library builds as `libmcuco.so` with a soname, so linking is the usual two flags:

{% highlight bash linenos %}
gcc blink.c -o blink -I/path/to/library/include -L/path/to/build -lmcuco
{% endhighlight %}

At runtime the loader has to be able to find the `.so`. If it is not in a standard directory, point `LD_LIBRARY_PATH` at it:

{% highlight bash linenos %}
LD_LIBRARY_PATH=/path/to/build ./blink /dev/ttyACM0
{% endhighlight %}

That runtime lookup is the one real cost of shared over static, and it is where most "it built fine but will not run" problems come from.

## Conclusion

The library is four layers and one public header, and the design decisions that matter are all about what it hides: an opaque handle so the struct can change freely, a single error vocabulary shared with the firmware, and an argument order that matches the wire. An application gets to call `mcuco_gpio_set` and think about nothing else.

Again, here is the [library's implementation](https://github.com/Causality-Labs/mcu-co_sdk/tree/main/library), and some [example code](https://github.com/Causality-Labs/mcu-co_sdk/tree/main/examples) showing how to use it.
