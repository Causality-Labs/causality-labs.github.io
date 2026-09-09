---
layout: page
title: mcu-co (February 2026 - September 2026)
description: Real-time co-processor that connects to a Linux host to receive GPIO and PWM commands, letting the MCU handle deterministic pin work (including autonomous interrupt-driven output actions).
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
        <p>mcu-co is a real-time I/O accelerator that pairs a Linux single board computer with a dedicated microcontroller. Linux is excellent at application logic but poor at timing: scheduling, preemption, and driver latency all add jitter to anything you try to do directly from userspace GPIO. mcu-co moves that time-critical pin work onto a microcontroller that has nothing else to do, and leaves the application logic on the host where it belongs. The full stack spans the firmware, a Linux shared library, and a CLI tool built on top of it. The plan for the whole project is laid out in the <a href="{% post_url 2026-03-22-mcu-co_Proposal %}">mcu-co proposal</a>.</p>

        <p>This post covers the co-processor portion of the project: the bare-metal firmware that runs on the MCU. The firmware turns an STM32G474RE into an I/O co-processor that listens on a serial link, executes binary-framed commands from the host, and answers every one of them. It gives the host GPIO configuration and control, pin-change interrupts, interrupt-to-output bindings that the MCU services entirely on its own, and twelve PWM outputs — all behind a checked command protocol with CRC-verified frames and an ACK or a NACK with a reason code for every command.</p>

        <p>It is written in C99 directly against the CMSIS device headers with no STM32 HAL. That was a deliberate choice: I wanted the practice of writing drivers from the reference manual and a complete understanding of what the hardware is actually doing, rather than a vendor library doing it for me. Along the way it produced a couple of standalone write-ups — one on <a href="{% post_url 2026-03-28-mcu-co_How_to_write_good_Driver %}">how to write a good driver</a> and one on the <a href="{% post_url 2026-06-14-mcu-co_Type_Agnostic_Ring_Buffer %}">type-agnostic ring buffer</a> that sits underneath the UART.</p>

        <p>Source code for the firmware can be found here: <a href="https://github.com/Causality-Labs/mcu-co_firmware" target="_blank" rel="noopener">mcu-co firmware</a>.</p>
    </div>
</div>

<h1 style="text-align: center;">Hardware</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/mcu-co/Hardware_Diagram.png" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-md-6">
        <p>The hardware side is two devices and one link between them:</p>

        <p><strong>Linux Host:</strong> The SBC that runs the application logic. Every operation starts here, as a command it sends over the link.</p>

        <p><strong>Communication Link (UART):</strong> A single serial connection between the two, carrying commands one way and ACK/NACK replies the other. The firmware uses USART2 for command traffic and keeps a second UART free for its own log output, so debug logging never interferes with the protocol.</p>

        <p><strong>MCU (STM32G474RE):</strong> A Cortex-M4F running at 170 MHz. It owns the pins and does nothing on its own; it executes the commands the host sends and answers each one. I chose it because its advanced timer peripherals cover the whole PWM feature set on a single chip.</p>

        <p><strong>GPIO (Output):</strong> Pins the MCU drives high or low on command.</p>

        <p><strong>GPIO (Input):</strong> Pins the MCU reads on command, and can watch for rising, falling, or both edges.</p>

        <p><strong>PWM (Output):</strong> Pins the MCU drives with a square wave at a set frequency and duty cycle.</p>
    </div>
</div>

<div class="row mt-3">
    <div class="col-md-12">
        <p>The twelve PWM outputs are divided into three <strong>groups</strong> of four, where a group is one hardware timer. Frequency comes from that timer's prescaler and reload, which all four channels share, so every pin in a group runs at the same frequency; duty cycle is per pin. Note that a group is not a port — the mapping comes from the STM32G4 alternate-function table, so group 0 spans ports A and B, and port B is split across groups 0 and 2.</p>

        <table class="table table-sm">
            <thead>
                <tr><th>Group</th><th>Timer</th><th>CH1</th><th>CH2</th><th>CH3</th><th>CH4</th></tr>
            </thead>
            <tbody>
                <tr><td>0</td><td>TIM2</td><td>PA5</td><td>PA1</td><td>PB10</td><td>PB11</td></tr>
                <tr><td>1</td><td>TIM3</td><td>PC6</td><td>PC7</td><td>PC8</td><td>PC9</td></tr>
                <tr><td>2</td><td>TIM4</td><td>PB6</td><td>PB7</td><td>PB8</td><td>PB9</td></tr>
            </tbody>
        </table>
    </div>
</div>

<h1 style="text-align: center;">Software</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/mcu-co/Firmware_Diagram.png" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-md-6">
        <p>The firmware is a bare-metal C99 application built with CMake and the arm-none-eabi toolchain, and it is made up of the following modules:</p>

        <p><strong>Frame Parser:</strong> Turns the incoming byte stream into complete command frames, and builds the response frames that go back to the host.</p>

        <p><strong>Command Dispatcher:</strong> Reads a frame's opcode, hands it to the controller that owns it, and packages the result as an ACK or a NACK.</p>

        <p><strong>GPIO Controller:</strong> Translates the GPIO and interrupt commands into driver calls, and keeps track of which pins are bound to which interrupt actions.</p>

        <p><strong>PWM Controller:</strong> Translates the PWM commands into timer calls, and tracks which groups and pins have been claimed.</p>

        <p><strong>GPIO Driver:</strong> The register-level driver for the GPIO ports: pin direction, levels, alternate functions, and interrupt setup.</p>

        <p><strong>Timer/PWM Driver:</strong> The register-level driver for TIM2, TIM3 and TIM4: prescaler and reload for frequency, compare registers for duty.</p>
    </div>
</div>

<div class="row mt-3">
    <div class="col-md-12">
        <p>The feature set the host gets out of these modules is:</p>

        <p><strong>GPIO:</strong> Configure any pin as an input or an output, drive outputs high or low, and read input levels.</p>

        <p><strong>Pin-change interrupts:</strong> Arm any pin to trigger on a rising edge, a falling edge, or both.</p>

        <p><strong>Interrupt-to-output bindings:</strong> Bind an armed edge on one pin to an action on another — drive it low, drive it high, or toggle it. The MCU services these itself in the interrupt handler, so once the binding is set the host is out of the loop entirely and the response time is the MCU's interrupt latency rather than a UART round trip. This is the part of the firmware that actually delivers on the "real-time" promise of the project.</p>

        <p><strong>PWM:</strong> Twelve outputs in three groups of four. Frequency is set per group, duty per pin, and both can be read back.</p>
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

        <p>The full wire format, the opcode table, and the per-command details are documented in <a href="https://github.com/Causality-Labs/mcu-co_firmware/blob/main/mcu-co_Protocol.md" target="_blank" rel="noopener">mcu-co_Protocol.md</a>.</p>
    </div>
</div>

<h4>Testing</h4>

<div class="row">
    <div class="col-md-12">
        <p>The modules above the drivers are tested host-natively with <a href="https://cpputest.github.io/" target="_blank" rel="noopener">CppUTest</a>, using spies in place of the hardware layers, so the frame parser, dispatcher, controllers, ring buffer, CRC and logger can all be exercised on a PC without flashing anything. On top of that, <a href="https://github.com/Causality-Labs/mcu-co_firmware/blob/main/tests/scripts/mcu-co_protocol_test.py" target="_blank" rel="noopener">mcu-co_protocol_test.py</a> drives the real board over the serial link for bring-up: each test declares what it expects (ACK, NACK, or no reply at all for the deliberately malformed frames) and is reported PASS or FAIL against it, with a non-zero exit code if anything failed — so it can go straight into a checklist after each flash.</p>
    </div>
</div>

<h1 style="text-align: center;">Demo</h1>

<div class="row">
    <div class="col-md-12">
        <p>Everything the firmware does is one of these exchanges. Configuring PA5 as an output and driving it high looks like this on the wire:</p>

{% highlight bash linenos %}
cmd   A5 30 03  01 00 05  AB E1     gpio cfg output A 5
               │  │  └ PIN  = 5
               │  └ PORT = A
               └ DIR  = output
ack   A5 01  01        1F 3E

cmd   A5 31 03  01 00 05  FA 4B     gpio set high A 5
ack   A5 01  01        1F 3E
{% endhighlight %}

        <p>Bringing up PWM group 0 (TIM2) at 1 kHz:</p>

{% highlight bash linenos %}
cmd   A5 40 05  E8 03 00 00  00  DE CD     pwm group cfg 1000 0
                │            └ GROUP = 0 (TIM2)
                └ FREQ = 0x000003E8 = 1000 Hz
ack   A5 01  01        1F 3E
{% endhighlight %}

        <p>And the interesting one — binding a rising edge on an input pin to a toggle on an output pin. After this single command the MCU handles the edge itself; the host never sees it and never has to respond to it:</p>

{% highlight bash linenos %}
gpio irq cfg rising A 0        arm PA0 for rising edges
gpio irq bind rising A 0 toggle A 5    PA0 rising -> toggle PA5
{% endhighlight %}

        <p>The commands shown in the right-hand column are the CLI form of each frame, which is what the host-side tooling in the rest of the mcu-co stack builds on top of.</p>
    </div>
</div>

<h1 style="text-align: center;">Conclusion</h1>

<div class="row">
    <div class="col-md-12">
        <p>The co-processor now covers everything mcu-co asks of the MCU: GPIO, pin-change interrupts, autonomous interrupt-to-output bindings, and PWM, all behind a protocol that is checked end to end.</p>

        <p>Next up is the Linux side of the project: the shared library written in C that owns the serial link and speaks this protocol on the host's behalf, and the CLI tool built on top of it. Feel free to fork the firmware repo and build on it — and if you are following the series, the next post picks up on the host side.</p>
    </div>
</div>
