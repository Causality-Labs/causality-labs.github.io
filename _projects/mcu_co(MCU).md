---
layout: page
title: mcu-co Firmware Part (February 2026 - September 2026)
description: Real-time co-processor that connects to a Linux host to receive commands, letting the MCU handle low latency deterministic pin work.
img: assets/img/blogs/mcu-co_Visual.png 
importance: 1
category: MCU
---

<h1 style="text-align: center;">Overview</h1>

<div class="row">
    <div class="col-md-12">
        {% include figure.liquid path="assets/img/mcu-co/mcu-co_block-diagram_v2.png" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

<div class="row mt-3">
    <div class="col-md-12">

        <p>Embedded Linux devices are excellent at application logic, networking stacks, servers, machine learning and more, but they are not well suited to low-latency, hard real-time work like PWM generation and interrupt handling (outside of kernel space).</p>

        <p>That is what gave me the idea for mcu-co: pairing a Linux host with a dedicated microcontroller that handles the timing-critical work, like interrupt handling and PWM generation. Offloading it that way gets you deterministic pin behavior without a real-time kernel, and leaves the host free to focus on high-level application logic.</p>

        <p>The mcu-co project spans the full stack. It contains firmware for an ARM Cortex-M4 microcontroller, a Linux shared library written in C that application programs can use to talk to it, and a CLI tool for driving it from the command line. The plan for the whole project is laid out in the <a href="{% post_url 2026-03-22-mcu-co_Proposal %}">mcu-co proposal</a>.</p>


        <p>This page covers the firmware for the microcontroller portion of the project. The firmware turns an STM32G474RE into an I/O co-processor that listens on a serial link. It is written in C99 directly against the CMSIS device headers with no STM32 HAL. I decided to go bare-metal for this project because I wanted to own the whole stack and gain a better understanding of microcontroller architecture.</p>

        <p>I also wrote a number of tutorials and documentation covering my design process, including <a href="{% post_url 2026-03-28-mcu-co_How_to_write_good_Driver %}">how to write a good driver</a>, <a href="{% post_url 2026-06-14-mcu-co_Type_Agnostic_Ring_Buffer %}">how to design a type agnostic ring-buffer</a>, <a href="{% post_url 2026-11-09-mcu-co_unit_tests %}">how to write unit-tests</a> and more. Here is a link to <a href="https://causality-labs.github.io/blog/category/mcu-co/">all of these posts</a>.</p>

        <p>Source code for the firmware can be found here: <a href="https://github.com/Causality-Labs/mcu-co_firmware" target="_blank" rel="noopener">mcu-co firmware</a>.</p>

    </div>
</div>

<h1 style="text-align: center;">Hardware</h1>

<div class="row">
    <div class="col-md-12">
        {% include figure.liquid path="assets/img/mcu-co/Hardware_Diagram.png" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

<div class="row mt-3">
    <div class="col-md-12">
        <p>The hardware side is two devices and one link between them:</p>

        <p><strong>Linux Host:</strong> The machine that runs the application logic. Every operation starts here, as a command it sends over the link.</p>

        <p><strong>Communication Link (UART):</strong> A single serial connection between the two, carrying commands one way and ACK/NACK replies the other. The firmware uses one UART channel for command traffic and keeps a second UART channel free for its own log output, so debug logging never interferes with the protocol.</p>

        <p><strong>MCU (STM32G474RE):</strong> A Cortex-M4F running at 170 MHz. It owns the pins and does nothing on its own; it executes the commands the host sends and answers each one. I chose it because its advanced timer peripherals cover the whole PWM feature set on a single chip.</p>

        <p><strong>GPIO (Output):</strong> Pins the MCU drives high or low on command.</p>

        <p><strong>GPIO (Input):</strong> Pins the MCU reads on command, and can watch for rising, falling, or both edges.</p>

        <p><strong>PWM (Output):</strong> Pins the MCU drives with a square wave at a set frequency and duty cycle.</p>
    </div>
</div>

<div class="row mt-3">
    <div class="col-md-12">
        <p>mcu-co gives the Linux host up to 12 PWM channels, arranged as three groups of four. All four channels in a group share a single frequency, so you can run up to three different frequencies at once, with four channels on each. Frequency goes up to 1 MHz, and duty cycle is set per channel in steps of 0.1%.</p>

        <p>For comparison, a Raspberry Pi 4 gives you two hardware PWM channels, clocked at 54 MHz. Duty steps are just the clock divided by the output frequency, so the faster you go the coarser the control gets: at 1 MHz the Pi is down to 54 steps, or about 2%. mcu-co runs its timers at 170 MHz, so it keeps the full 0.1% up to roughly 170 kHz and still has 170 steps at 1 MHz, on twelve channels instead of two.</p>

    </div>
</div>

<div class="row mt-3">
    <div class="col-md-12">
        <p>mcu-co also hands the Linux host 43 extra GPIO pins. Each one is addressed by port and pin number over the serial link, and can be configured as an input or an output at runtime. Outputs are driven high or low on command, inputs are read back on command, and up to 16 inputs can be armed to interrupt on a rising edge, a falling edge, or both.</p>

        <p>These sit on top of whatever the host board already exposes, so a host that has run out of usable pins simply gets another bank of them. The more useful part is that they behave deterministically. An interrupt-to-output binding is serviced by the MCU itself, so the reaction time is the MCU's interrupt latency rather than a trip up through the Linux scheduler and back.</p>

    </div>
</div>

<h1 style="text-align: center;">Software</h1>

<div class="row">
    <div class="col-md-12">
        {% include figure.liquid path="assets/img/mcu-co/Firmware_Diagram.png" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

<div class="row mt-3">
    <div class="col-md-12">
        <p>The firmware is a bare-metal C99 application built with CMake and the arm-none-eabi toolchain, and it is made up of the following modules:</p>

        <p><strong><a href="{% post_url 2026-09-09-mcu-co_State_Machine %}">Frame Parser</a>:</strong> Turns the incoming byte stream into complete command frames, and builds the response frames that go back to the host.</p>

        <p><strong><a href="{% post_url 2026-09-09-mcu-co_Command_Dispatcher %}">Command Dispatcher</a>:</strong> Reads a frame's opcode, hands it to the controller that owns it, and packages the result as an ACK or a NACK.</p>

        <p><strong><a href="{% post_url 2026-11-09-mcu-co_gpio_and_pwm_controllers %}">GPIO Controller</a>:</strong> Translates the GPIO and interrupt commands into driver calls, and keeps track of which pins are bound to which interrupt actions.</p>

        <p><strong><a href="{% post_url 2026-11-09-mcu-co_gpio_and_pwm_controllers %}">PWM Controller</a>:</strong> Translates the PWM commands into timer calls, and tracks which groups and pins have been claimed.</p>

        <p><strong>GPIO Driver:</strong> The register-level driver for the GPIO ports: pin direction, levels, alternate functions, and interrupt setup.</p>

        <p><strong>Timer/PWM Driver:</strong> The register-level driver for TIM2, TIM3 and TIM4: prescaler and reload for frequency, compare registers for duty.</p>
    </div>
</div>


<h4>Command protocol</h4>

<div class="row">
    <div class="col-md-12">
        <p>The host and the MCU talk over a strict master-slave protocol with one command in flight at a time. A command frame is:</p>

{% highlight text %}
SOF · OPCODE · LEN · PAYLOAD · CRC_L · CRC_H
{% endhighlight %}

        <p>and a response frame is:</p>

{% highlight text %}
SOF · LEN · ACK/NACK [ · DATA ] · CRC_L · CRC_H
{% endhighlight %}

        <p>A few decisions worth calling out:</p>

        <ul>
            <li><strong>Every frame is CRC-checked.</strong> CRC16-CCITT-FALSE covers everything but the start-of-frame byte and the CRC itself. A frame that fails the check is dropped silently rather than NACKed, because a corrupted frame's opcode can't be trusted either.</li>
            <li><strong>Every command gets an answer.</strong> An ACK, or a NACK carrying a one-byte reason code, so the host can tell "that pin is already in use" from "that pin number doesn't exist" instead of only seeing a refusal.</li>
            <li><strong>The reason codes are the firmware's own <code>status_t</code> values, sent verbatim.</strong> One vocabulary of errors instead of a second protocol-only list that would drift away from the internal one.</li>
            <li><strong>There is no opcode echo in the response.</strong> With one command in flight the host already knows which command a reply answers, so the field would be dead weight on every frame.</li>
            <li><strong><code>LEN</code> arrives before the ACK/NACK byte</strong>, so the host always knows how many bytes are coming without having to know the outcome first.</li>
        </ul>
    </div>
</div>

<h1 style="text-align: center;">Demo</h1>

<div class="row">
    <div class="col-md-12">
        <p>Below are some example commands the CLI provides on the Linux host side.</p>

{% highlight bash linenos %}
mcu-co gpio cfg output A 5      # configure PA5 as an output
mcu-co gpio set high A 5        # drive PA5 high

mcu-co gpio cfg input A 0       # configure PA0 as an input
mcu-co gpio get A 0             # read PA0 back
{% endhighlight %}

        <p>Bringing up PWM group 0 (TIM2) at 1 kHz and running PA5 at 25% duty:</p>

{% highlight bash linenos %}
mcu-co pwm group cfg 1000 0      # group 0 (TIM2) at 1000 Hz
mcu-co pwm channel cfg high A 5  # claim PA5, active high
mcu-co pwm channel set 250 A 5   # 25.0% duty (tenths of a percent)
{% endhighlight %}

        <p>And the interesting one, binding a rising edge on an input pin to a toggle on an output pin. After these two commands the MCU handles the edge itself; the host never sees it and never has to respond to it:</p>

{% highlight bash linenos %}
mcu-co gpio irq cfg rising A 0              # arm PA0 for rising edges
mcu-co gpio irq bind rising A 0 toggle A 5  # PA0 rising -> toggle PA5
{% endhighlight %}

    </div>
</div>

<h1 style="text-align: center;">Conclusion</h1>

<div class="row">
    <div class="col-md-12">
        <p>The co-processor now covers everything mcu-co asks of the MCU: GPIO, pin-change interrupts, autonomous interrupt-to-output bindings, and PWM, all behind a protocol that is checked end to end.</p>

        <p>Next up is the Linux side of the project: the shared library written in C that owns the serial link and speaks this protocol on the host's behalf, and the CLI tool built on top of it. Feel free to fork the firmware repo and build on it, and if you are following the series, the next post picks up on the host side.</p>

        <p>Again, you can find documentation and tutorials related to this project <a href="https://causality-labs.github.io/blog/category/mcu-co/">here</a>.</p>
    </div>
</div>
