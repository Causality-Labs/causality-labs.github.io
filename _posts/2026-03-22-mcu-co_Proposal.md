---
layout: post
title: mcu-co Proposal (mcu-co P1)
date: 2026-03-22 09:40:16
description: Introducing mcu-co, which pairs a Linux host with a dedicated microcontroller to give it deterministic pin control without a real-time kernel
tags: Embedded-Linux MCU
categories: mcu-co
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## What is mcu-co

mcu-co pairs a Linux host with a dedicated microcontroller that handles the timing-critical work, like interrupt handling and PWM generation. Offloading it that way gets you deterministic pin behavior without a real-time kernel, and leaves the host free to focus on high-level application logic. Everything the co-processor can do is available to any Linux application through a C library and a command line interface.

## Core Features

#### I/O

- **Standard GPIO** — pin direction configuration, high-speed pin state manipulation (High/Low), and input sensing
- **Pin-change interrupts** — arm any input pin to trigger on a rising edge, a falling edge, or both
- **Interrupt-to-output bindings** — logic-locked pins that react to an edge on another pin without any software intervention, serviced entirely by the MCU
- **Advanced PWM** — jitter-free pulse-width modulation for motor control and power electronics, with frequency set per timer group and duty cycle set per pin

#### Reliability

- **A checked command protocol** — strict master-slave with one command in flight at a time, CRC-checked frames, and an ACK or a NACK with a reason code for every command sent

## Software for mcu-co

The mcu-co stack is a complete "Vertical" solution, ranging from low-level firmware to high-level application code:

| Layer | Component | Description |
|-------|-----------|-------------|
| Hardware | MCU Firmware | Optimized real-time firmware for an STM32G474RE MCU |
| OS Layer | Yocto Layer | meta-mcu-co recipes for seamless integration into custom Linux builds |
| Tools | mcu-co CLI | A powerful Command Line Interface for testing and field diagnostics |
| Dev Kit | C SDK | Native C shared library for fast application development |


## Why use mcu-co?

Unlike standard Linux GPIO, which suffers from "jitter" (unpredictable delays), mcu-co ensures that your hardware reacts at the exact same time, every time. It is the bridge between the intelligence of Linux and the speed of silicon.

## Design

The following block diagram shows the high-level architecture of the mcu-co system:

{% include figure.liquid path="assets/img/mcu-co/mcu-co_block-diagram_v2.png" class="img-fluid rounded z-depth-1" zoomable=true %}


#### MCU

The micro-controller (MCU) I decided to go with is the STM32G474RE. I chose this MCU because it is a high-performance Cortex-M4F with advanced timer peripherals capable of driving twelve PWM outputs, plenty of GPIO with per-pin edge interrupts, and enough headroom at 170 MHz to service those interrupts with very little latency, covering the entire mcu-co feature set on a single chip.

The firmware will be a bare metal application that parses commands received from the Linux host. The physical link between the SoC and the MCU is a UART. I chose a UART because every Linux-capable SoC exposes one, and on the MCU side it needs nothing beyond a driver I write myself, which keeps the firmware bare metal and makes the traffic easy to observe with any serial monitor.

#### Linux

On the Linux side, the software will consist of an SDK: a dynamic C library and a command line interface built on top of it. These tools are SoC agnostic and will work on any Linux-capable SoC, keeping with mcu-co's core theme of being plug and play.

#### SDK

The SDK is comprised of a dynamic C library and a command line interface. It allows developers to easily integrate mcu-co into their applications without needing to understand the underlying communication protocol. The library owns the serial link and speaks the protocol on the application's behalf, and the CLI, built on that same library, is designed for testing and field diagnostics.

#### Yocto (meta-mcu-co)

The Yocto layer (meta-mcu-co) will package the library and the CLI, allowing developers working with Yocto to include mcu-co in their own custom Embedded Linux images with minimal effort.

## Conclusion

I believe mcu-co is actually a super useful tool and will give Linux developers real-time control, which is something Linux is known to struggle with. With mcu-co one can offload time-critical tasks to dedicated hardware, unlocking deterministic control over GPIO and PWM from any Linux application without leaving the comfort of a high-level API.

mcu-co also serves as a great learning opportunity for me and for you, the reader. I plan on making this a series, so those who are interested and follow along will have the opportunity to learn a thing or two about multiple fields in embedded software, from bare-metal firmware to Linux software to Yocto development. This project will cover a lot of ground, so there is something in it for everyone. For me, this is the first time I have taken on a project of such depth and so many moving parts, it will give me the opportunity to elevate my skills as an engineer by quite a bit. I am very excited to work on this project and to share my progress with you all. In the next post I will go over the MCU firmware for the project, see you then!