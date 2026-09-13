---
layout: post
title: mcu-co How to unit test embedded C (mcu-co P7)
date: 2026-09-13 09:40:16
description: How to unit test embedded C , using the mcu-co's modules as an example
tags: MCU
categories: mcu-co
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## Introduction

In this post we will go over Test Driven Development, why unit tests are important, and how to write them, using mcu-co as a reference. Before you can write unit tests for your software, that software first has to be testable in the first place, which means the code has to be modular in design. That modularity is also what makes the code robust and reusable. I have been following the practices from the well-known book *Test-Driven Development for Embedded C* by James Grenning, which you can find for purchase on Amazon [here](https://www.amazon.com/Driven-Development-Embedded-Pragmatic-Programmers/dp/193435662X), or read this [paper](https://wingman-sw.com/papers/EmbeddedTdd-Grenning-v1r1.pages.pdf) for a high-level summary of what the book teaches.

The full test suite can be found [here](https://github.com/Causality-Labs/mcu-co_firmware/tree/main/tests/unit-tests).

#### What is Test Driven Development

Test Driven Development is a workflow where you write a test before writing the code it tests, this means you write a failing test, make it pass, then clean up. Writing the test first forces you to define what "done" means before you start, pushes you toward designs with clear boundaries (code that's hard to test is usually code that's tangled), and catches breakage seconds after you cause it rather than days later. The tests you accumulate then act as a safety net that makes refactoring something you can do without fear.

#### Why are Unit Tests important

I believe unit tests are vital for any well-designed codebase. A good suite catches bugs seconds after you write them instead of days later, and points at exactly which function broke rather than leaving you to guess. It lets you refactor without fear, since a passing suite is proof you haven't changed behavior. It exercises edge cases you'd never think to hit by hand, and once a bug is fixed, a regression test makes sure it stays fixed. In embedded work specifically, a host-side test suite also lets you tell a software bug apart from a hardware one before you ever pick up a probe. And as a side effect, the tests themselves end up documenting how a module is meant to be used.


## How to write unit tests

There are two types of unit tests we need to worry about: tests that are pure logic, and tests that depend on hardware.
Logic-bound tests like writing a test for ring buffer or a math library are easier to write because the code under test has no external dependencies. You construct it, feed it known inputs, and assert on the output, and it runs the same way every time on the host. Hardware-dependent tests, like writing tests for a sensor driver, are more complex because the code under test calls real registers and peripherals that don't exist on the host, so that boundary has to be faked before the test can run at all.

In mcu-co we have two modules that demonstrate this perfectly: the ring buffer is our logic-bound test, which we covered in [P3]({% post_url 2026-06-14-mcu-co_Type_Agnostic_Ring_Buffer %}), and the GPIO and PWM controllers are our hardware-bound tests, which we covered in [P6]({% post_url 2026-11-09-mcu-co_gpio_and_pwm_controllers %}).

The tests below use [CppUTest](https://cpputest.github.io/), the framework the Grenning book teaches with. Here is a link to some background on how to use the CppUTest framework as I want to keep this post focused on my specifc use case.

#### Testing the ring buffer

The ring buffer is one of the most widely used data structures in embedded software, and it also serves as a perfect example for learning how to write unit tests: it is easy to predict how it should behave, which makes it easy to know what the test output should be.

For reference, here is a link to the ring buffer's [header file](https://github.com/Causality-Labs/mcu-co_firmware/blob/main/data_structures/ring-buffer.h) for more insight into how it is meant to behave. The struct itself is small:

{% highlight c linenos %}
typedef struct
{
    void *buffer;
    size_t element_size;
    uint16_t capacity; /**< Total slot count; must be a power of two. */
    uint16_t head;     /**< Write index (producer-owned). */
    uint16_t tail;     /**< Read index (consumer-owned). */
    uint16_t mask;     /**< capacity - 1, used for index wraparound. */
} ring_buffer_t;
{% endhighlight %}

The important thing to notice is that the struct does not contain a buffer: it contains a `void *` to one. The ring buffer never allocates anything itself. The caller declares the storage array, hands its address to `ring_buffer_init()` along with the size of a single element, and the ring buffer just memcpy's `element_size` bytes in and out of memory it does not own. That is what makes it type agnostic: it never needs to know what it is storing, only how big one of them is. It also means there is no `malloc` anywhere, and the RAM cost of every buffer in the firmware is visible at the call site, which matters on a part where you want to know your memory budget at link time.

Here is the setup function that CppUtest calls before every test, in our use case it is simply just initializing the ring buffer that we will be using for our tests.
{% highlight cpp linenos %}
#define CAPACITY 4U /* 1 slot reserved: holds at most CAPACITY - 1 elements */

TEST_GROUP(RingBuffer)
{
    uint8_t storage[CAPACITY];
    ring_buffer_t rb;

    void setup() override
    {
        ring_buffer_init(&rb, storage, CAPACITY, sizeof(uint8_t));
    }
};
{% endhighlight %}

From there a test is just "feed it a known sequence, assert on what comes back". We are going to focus on testing some interesting edge cases beiing a full buffer, an empty one, and the wraparound in between:

{% highlight cpp linenos %}
// With overwrite=false, writing to a full buffer should fail and leave the
// existing (oldest) data untouched.
TEST(RingBuffer, WriteFailsWhenBufferIsFull)
{
    uint8_t oldest = 11;
    uint8_t val = 0;
    bool overwrite = false;

    LONGS_EQUAL(STATUS_OK, ring_buffer_write(&rb, &oldest, overwrite));
    for (uint8_t i = 1; i < CAPACITY - 1U; i++)
    {
        val = i;
        LONGS_EQUAL(STATUS_OK, ring_buffer_write(&rb, &val, overwrite));
    }

    CHECK_TRUE(ring_buffer_is_full(&rb));

    val = 99;
    LONGS_EQUAL(STATUS_ERR_FULL, ring_buffer_write(&rb, &val, overwrite));
    BYTES_EQUAL(11, storage[0]);
}
{% endhighlight %}

Walking through it: we write `11` as the first element, then loop to fill the buffer to the brim, and confirm it reports itself as full. Then we try to write one more element, `99`, with `overwrite` set to false. We expect two things to happen: the write is rejected with `STATUS_ERR_FULL`, and the buffer's contents are left alone, which we check by confirming the first element is still `11`.

This is worth testing because buffers really do fill up whenever the producer outruns the consumer. And if a full buffer is handled wrong, it either writes past the end of your memory or silently corrupts the data already in it. Neither of those announces itself, leaving you to debug the symptom somewhere else entirely.

The overwrite case is the same idea, except here the assertion is about ordering. Writing a fourth element into a full buffer should evict the oldest one and leave the rest readable in order:

{% highlight cpp linenos %}
TEST(RingBuffer, WriteOverwritesOldestWhenFullAndOverwriteTrue)
{
    uint8_t a = 1, b = 2, c = 3, d = 4;
    bool no_overwrite = false;
    bool overwrite    = true;

    LONGS_EQUAL(STATUS_OK, ring_buffer_write(&rb, &a, no_overwrite));
    LONGS_EQUAL(STATUS_OK, ring_buffer_write(&rb, &b, no_overwrite));
    LONGS_EQUAL(STATUS_OK, ring_buffer_write(&rb, &c, no_overwrite));
    CHECK_TRUE(ring_buffer_is_full(&rb));

    LONGS_EQUAL(STATUS_OK, ring_buffer_write(&rb, &d, overwrite));

    uint8_t out = 0;
    LONGS_EQUAL(STATUS_OK, ring_buffer_read(&rb, &out));
    BYTES_EQUAL(2, out);
    LONGS_EQUAL(STATUS_OK, ring_buffer_read(&rb, &out));
    BYTES_EQUAL(3, out);
    LONGS_EQUAL(STATUS_OK, ring_buffer_read(&rb, &out));
    BYTES_EQUAL(4, out);
    CHECK_TRUE(ring_buffer_is_empty(&rb));
}
{% endhighlight %}

In this test we write `1`, `2` and `3`, which fills the buffer, and confirm it reports itself as full. Then we write a fourth element, `4`, this time with `overwrite` set to true. That write is expected to succeed. Finally we read everything back out and check we get `2`, `3`, `4` in that order, meaning the oldest element `1` was the one evicted to make room, and that the buffer reports empty once we have drained it.

#### Testing the controllers

The tests for the controllers involve some extra steps, because they depend on the gpio and timer drivers. These drivers write to actual peripherals which are not on your host system. To circumvent that we can use spies and mocks.

Both are just stand-ins: fake versions of a dependency that you build into the test instead of the real thing. They have the same function names and the same arguments as the real driver, so the code under test calls them exactly as it always would and never knows the difference. The difference between the two is how they check your code. A spy quietly writes down what it was called with, and the test inspects those notes afterwards to decide whether it passes. A mock is told up front which calls it should expect, and fails the test itself as soon as something unexpected comes in. In mcu-co I decided to use spies instead of mocks because all I really want to check is that the bytes off the wire became the right pin, channel and value, and a spy records exactly that.


#### Faking the driver layer

The swap itself happens at link time. `gpio_spy.c` implements the exact same function signatures as `gpio.c`, but instead of touching registers it records the arguments it was handed and returns a status the test can control:

{% highlight c linenos %}
static gpio_pin_t last_init_pin;
static gpio_config_t last_init_config;
static status_t forced_status;

status_t gpio_init(const gpio_pin_t *gpio, const gpio_config_t *config)
{
    last_init_pin    = *gpio;
    last_init_config = *config;
    return forced_status;
}

status_t gpio_set_state(const gpio_pin_t *gpio, gpio_state_t state)
{
    last_set_state_pin   = *gpio;
    last_set_state_state = state;
    return forced_status;
}
{% endhighlight %}

The spy exposes two kinds of hooks to the test: setters that decide what the driver "returns" (`GpioSpy_SetReturnStatus`), and getters that report what it was called with (`GpioSpy_GetLastInitPin`, `GpioSpy_GetLastInitConfig`). `GpioSpy_Reset()` runs in `setup()` so nothing leaks between tests.

Nothing in the controller changes. The substitution happens in the test build, which compiles the real `gpio_controller.c` but links it against the spy instead of the real driver.

#### Example: gpio_controller_io_cfg

With the spy in place, a test can assert on the *translation*, not just the return code, checking that the three wire bytes became the right `gpio_pin_t` and the right `gpio_config_t`:

{% highlight cpp linenos %}
// Happy path: valid input should translate the wire bytes into a correctly
// populated gpio_pin_t and gpio_config_t passed to gpio_init().
TEST(GpioController, IoCfgCallsGpioInitWithCorrectPinAndConfig)
{
    uint8_t payload[3] = {GPIO_MODE_OUTPUT, GPIO_PORT_B, 5};

    LONGS_EQUAL(STATUS_OK, gpio_controller_io_cfg(payload, 3));

    gpio_pin_t pin = GpioSpy_GetLastInitPin();
    LONGS_EQUAL(GPIO_PORT_B, pin.port);
    LONGS_EQUAL(5, pin.pin);

    gpio_config_t config = GpioSpy_GetLastInitConfig();
    LONGS_EQUAL(GPIO_MODE_OUTPUT, config.mode);
    LONGS_EQUAL(GPIO_TYPE_PUSH_PULL, config.type);
    LONGS_EQUAL(GPIO_SPEED_LOW, config.speed);
    LONGS_EQUAL(GPIO_PULL_NONE, config.pull);
}
{% endhighlight %}

A controller that swapped the port and pin bytes would still return `STATUS_OK`. It would not survive this test.

The other half is failure handling. Forcing the driver to fail proves the controller passes the reason back up instead of swallowing it:

{% highlight cpp linenos %}
// A failure from gpio_init() must be propagated, not swallowed.
TEST(GpioController, IoCfgPropagatesGpioInitFailure)
{
    GpioSpy_SetReturnStatus(STATUS_ERR_NOT_INIT);

    uint8_t payload[3] = {GPIO_MODE_OUTPUT, GPIO_PORT_A, 0};
    LONGS_EQUAL(STATUS_ERR_NOT_INIT, gpio_controller_io_cfg(payload, 3));
}
{% endhighlight %}

That is a path you would have real trouble producing on hardware, and it is two lines here.

#### Example: pwm_controller_channel_set

The PWM spy records a *sequence* of calls rather than just the last one, because the controller has to resolve the pin to a timer channel before it can set anything. The test asserts on both steps, and on the decoded duty:

{% highlight cpp linenos %}
// DUTY is the first two payload bytes, little-endian: E8 03 is 1000, and read
// the other way round it would be 59395 - a value the driver would reject, so a
// byte-swapped decode can't hide behind a passing status.
TEST(PwmController, ChannelSetForwardsDecodedDutyToTheDriver)
{
    uint8_t payload[SET_LEN] = {0xE8, 0x03, GPIO_PORT_B, 7};

    TimerSpy_SetLookupResult(TIMER_TIM4, TIMER_CH2);

    LONGS_EQUAL(STATUS_OK, pwm_controller_channel_set(payload, SET_LEN));

    LONGS_EQUAL(TIMER_CALL_PWM_SET_DUTY, TimerSpy_GetCall(1));
    LONGS_EQUAL(1000, TimerSpy_GetLastDuty());
    LONGS_EQUAL(TIMER_TIM4, TimerSpy_GetLastInstance());
    LONGS_EQUAL(TIMER_CH2, TimerSpy_GetLastChannel());
}
{% endhighlight %}

The choice of `0xE8 0x03` is deliberate. Little-endian it is 1000, and byte-swapped it is 59395, a duty the driver would reject outright, so an endianness bug cannot hide behind a passing status. Picking test values that *fail loudly* when the code is wrong is most of what makes a test worth having.
