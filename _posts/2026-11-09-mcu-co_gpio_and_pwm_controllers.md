---
layout: post
title: mcu-co How to write GPIO and PWM controllers (mcu-co P6)
date: 2026-09-13 09:40:16
description: How to decode a validated command payload into pin and channel actions on real hardware, using the mcu-co GPIO and PWM controllers as the example
tags: MCU
categories: mcu-co
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## Introduction
This post will go over the controller layer of mcu-co. Its job is to decode the incoming payload and translate it into calls on the general-purpose peripheral drivers (`gpio.c`, `pwm`/timer). Abstracting away the low-level behavior of those drivers keeps the controller code modular and testable, which matters a lot in embedded software design.

The full implementation can be found [here](https://github.com/Causality-Labs/mcu-co_firmware/blob/main/src/gpio_controller.c) and [here](https://github.com/Causality-Labs/mcu-co_firmware/blob/main/src/pwm_controller.c).

## High Level Overview

{% include figure.liquid path="assets/img/mcu-co/mcu-co_controllers.png" class="img-fluid rounded z-depth-1" width="50%" zoomable=true %}

The block diagram above illustrates the purpose of the GPIO and PWM controllers: it simply takes the raw payload bytes handed to it by the dispatcher, validates and decodes them into pin or channel arguments, and calls into the underlying GPIO or timer driver to carry out the operation.


## GPIO Controller

Here are some sample functions to get a hint of how the gpio controller works:


{% highlight c linenos %}
status_t gpio_controller_io_cfg(const uint8_t *payload, uint8_t length)
{
    if (payload == NULL)
    {
        return STATUS_ERR_INVALID_ARG;
    }

    if (length != GPIO_CFG_PAYLOAD_LEN)
    {
        return STATUS_ERR_INVALID_ARG;
    }

    uint8_t dir  = payload[GPIO_CFG_DIR_IDX];
    uint8_t port = payload[GPIO_CFG_PORT_IDX];
    uint8_t pin  = payload[GPIO_CFG_PIN_IDX];

    if ((dir != (uint8_t)GPIO_MODE_INPUT) && (dir != (uint8_t)GPIO_MODE_OUTPUT))
    {
        return STATUS_ERR_INVALID_ARG;
    }

    if (port >= GPIO_NUM_OF_PORTS)
    {
        return STATUS_ERR_INVALID_PIN;
    }

    if (pin > MAX_PIN_COUNT)
    {
        return STATUS_ERR_INVALID_PIN;
    }

    const gpio_pin_t gpio = {
        .port = (gpio_port_t)port,
        .pin  = pin,
    };

    const gpio_config_t config = {
        .mode  = (gpio_mode_t)dir,
        .type  = GPIO_TYPE_PUSH_PULL,
        .speed = GPIO_SPEED_LOW,
        .pull  = GPIO_PULL_NONE,
    };

    return gpio_init(&gpio, &config);
}
{% endhighlight %}

`gpio_controller_io_cfg` validates the payload, then configures the given pin as an input or output.

{% highlight c linenos %}
status_t gpio_controller_write(const uint8_t *payload, uint8_t length)
{
    if (payload == NULL)
    {
        return STATUS_ERR_INVALID_ARG;
    }

    if (length != GPIO_WRITE_PAYLOAD_LEN)
    {
        return STATUS_ERR_INVALID_ARG;
    }

    uint8_t level = payload[GPIO_WRITE_LEVEL_IDX];
    uint8_t port  = payload[GPIO_WRITE_PORT_IDX];
    uint8_t pin   = payload[GPIO_WRITE_PIN_IDX];

    if ((level != (uint8_t)GPIO_LOW) && (level != (uint8_t)GPIO_HIGH))
    {
        return STATUS_ERR_INVALID_ARG;
    }

    if (port >= GPIO_NUM_OF_PORTS)
    {
        return STATUS_ERR_INVALID_PIN;
    }

    if (pin > MAX_PIN_COUNT)
    {
        return STATUS_ERR_INVALID_PIN;
    }

    const gpio_pin_t gpio = {
        .port = (gpio_port_t)port,
        .pin  = pin,
    };

    return gpio_set_state(&gpio, (gpio_state_t)level);
}
{% endhighlight %}

`gpio_controller_write` validates the payload, then drives the given pin high or low.

{% highlight c linenos %}
status_t gpio_controller_read(const uint8_t *payload, uint8_t length, bool *state)
{
    if ((payload == NULL) || (state == NULL))
    {
        return STATUS_ERR_INVALID_ARG;
    }

    if (length != GPIO_READ_PAYLOAD_LEN)
    {
        return STATUS_ERR_INVALID_ARG;
    }

    uint8_t port = payload[GPIO_READ_PORT_IDX];
    uint8_t pin  = payload[GPIO_READ_PIN_IDX];

    if (port >= GPIO_NUM_OF_PORTS)
    {
        return STATUS_ERR_INVALID_PIN;
    }

    if (pin > MAX_PIN_COUNT)
    {
        return STATUS_ERR_INVALID_PIN;
    }

    const gpio_pin_t gpio = {
        .port = (gpio_port_t)port,
        .pin  = pin,
    };

    return gpio_read(&gpio, state);
}
{% endhighlight %}

`gpio_controller_read` validates the payload, then reads the current state of the given pin into `state`.

## PWM Controller

{% highlight c linenos %}
status_t pwm_controller_channel_cfg(const uint8_t *payload, uint8_t length)
{
    if (payload == NULL)
    {
        LOG_ERROR(MODULE_NAME, "payload argument is null");
        return STATUS_ERR_INVALID_ARG;
    }

    if (length != PWM_CHANNEL_CFG_PAYLOAD_LEN)
    {
        LOG_ERROR(MODULE_NAME, "invalid length %u, expected %u", length, PWM_CHANNEL_CFG_PAYLOAD_LEN);
        return STATUS_ERR_INVALID_ARG;
    }

    uint8_t polarity = payload[PWM_CHANNEL_CFG_POL_IDX];

    if ((polarity != TIMER_POLARITY_ACTIVE_LOW) && (polarity != TIMER_POLARITY_ACTIVE_HIGH))
    {
        LOG_ERROR(MODULE_NAME, "invalid polarity %u", polarity);
        return STATUS_ERR_INVALID_ARG;
    }

    uint8_t port = payload[PWM_CHANNEL_CFG_PORT_IDX];
    uint8_t pin  = payload[PWM_CHANNEL_CFG_PIN_IDX];

    /* Given values the lookup overwrites: the compiler cannot see through the
     * call, so -Wmaybe-uninitialized fires without them. */
    timer_instance_t instance = TIMER_TIM2;
    timer_channel_t channel   = TIMER_CH1;

    status_t status_ret = resolve_channel(port, pin, &instance, &channel);

    if (status_ret != STATUS_OK)
    {
        return status_ret;
    }

    const timer_pwm_config_t pwm_config = {
        .duty_permille = 0U,
        .polarity      = (timer_polarity_t)polarity,
    };

    return timer_pwm_channel_init(instance, channel, &pwm_config);
}
{% endhighlight %}

`pwm_controller_channel_cfg` validates the payload, resolves the pin to its timer/channel, and configures that channel's polarity with a starting duty of 0.

{% highlight c linenos %}
status_t pwm_controller_channel_set(const uint8_t *payload, uint8_t length)
{
    if (payload == NULL)
    {
        LOG_ERROR(MODULE_NAME, "payload argument is null");
        return STATUS_ERR_INVALID_ARG;
    }

    if (length != PWM_CHANNEL_SET_PAYLOAD_LEN)
    {
        LOG_ERROR(MODULE_NAME, "invalid length %u, expected %u", length, PWM_CHANNEL_SET_PAYLOAD_LEN);
        return STATUS_ERR_INVALID_ARG;
    }

    uint8_t port = payload[PWM_CHANNEL_SET_PORT_IDX];
    uint8_t pin  = payload[PWM_CHANNEL_SET_PIN_IDX];

    /* Given values the lookup overwrites: the compiler cannot see through the
     * call, so -Wmaybe-uninitialized fires without them. */
    timer_instance_t instance = TIMER_TIM2;
    timer_channel_t channel   = TIMER_CH1;

    status_t status_ret = resolve_channel(port, pin, &instance, &channel);

    if (status_ret != STATUS_OK)
    {
        return status_ret;
    }

    uint16_t duty = read_uint16_le(&payload[PWM_CHANNEL_SET_DUTY_IDX]);

    return timer_pwm_set_duty(instance, channel, duty);
}
{% endhighlight %}

`pwm_controller_channel_set` validates the payload, resolves the pin to its timer/channel, and sets that channel's duty cycle.

{% highlight c linenos %}
status_t pwm_controller_channel_get(const uint8_t *payload, uint8_t length, uint16_t *duty_permille)
{
    if (payload == NULL)
    {
        LOG_ERROR(MODULE_NAME, "payload argument is null");
        return STATUS_ERR_INVALID_ARG;
    }

    if (length != PWM_CHANNEL_GET_PAYLOAD_LEN)
    {
        LOG_ERROR(MODULE_NAME, "invalid length %u, expected %u", length, PWM_CHANNEL_GET_PAYLOAD_LEN);
        return STATUS_ERR_INVALID_ARG;
    }

    if (duty_permille == NULL)
    {
        LOG_ERROR(MODULE_NAME, "duty output argument is null");
        return STATUS_ERR_INVALID_ARG;
    }

    uint8_t port = payload[PWM_CHANNEL_GET_PORT_IDX];
    uint8_t pin  = payload[PWM_CHANNEL_GET_PIN_IDX];

    /* Given values the lookup overwrites: the compiler cannot see through the
     * call, so -Wmaybe-uninitialized fires without them. */
    timer_instance_t instance = TIMER_TIM2;
    timer_channel_t channel   = TIMER_CH1;

    status_t status_ret = resolve_channel(port, pin, &instance, &channel);

    if (status_ret != STATUS_OK)
    {
        return status_ret;
    }

    return timer_pwm_get_duty(instance, channel, duty_permille);
}
{% endhighlight %}

`pwm_controller_channel_get` validates the payload, resolves the pin to its timer/channel, and reads that channel's current duty cycle into `duty_permille`.

