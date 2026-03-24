---
layout: post
title: mcu-co Proposal (mcu-co P1)
date: 2026-03-22 09:40:16
description: Introducing mcu-co, a professional-grade real-time I/O accelerator that bridges a Linux host to a dedicated co-processor for deterministic hardware execution
tags: Embedded-Linux MCU
categories: mcu-co
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## What is mcu-co

mcu-co is a professional-grade, real-time I/O accelerator that bridges a Linux host to a dedicated co-processor. It provides deterministic hardware execution by offloading time-critical tasks from the Linux kernel to dedicated hardware, all accessible via C and Python SDKs.

## Core Features

#### Digital I/O

- **Standard GPIO** — high-speed pin state manipulation (High/Low) and input sensing
- **Bounded Features** — logic-locked pins that react to internal states without software intervention
- **Precision Pulses** — single or repeating pulses with nanosecond-level accuracy

#### PWM & Analog Control

- **Advanced PWM** — jitter-free pulse-width modulation for motor control and power electronics
- **ADC** — single-shot analog reads, streaming is planned for future releases

#### Safety & Reliability

- **Hardware Watchdog** — monitors the connection between host and MCU; triggers safety protocols if the link is lost
- **Safe State Management** — user-defined default pin states for power-on or emergency scenarios
- **E-Stop** — immediate hardware-level shutdown of all critical outputs

## Software for mcu-co

The mcu-co stack is a complete "Vertical" solution, ranging from low-level firmware to high-level application code:

| Layer | Component | Description |
|-------|-----------|-------------|
| Hardware | MCU Firmware | Optimized real-time firmware for an STM32G474RE MCU |
| OS Layer | Yocto Layer | meta-mcu-co recipes for seamless integration into custom Linux builds |
| System | mcu-co Daemon | A background service that manages concurrency and hardware communication |
| Tools | mcu-co CLI | A powerful Command Line Interface for testing and field diagnostics |
| Dev Kit | C & Python SDKs | Native C library and Python module for fast application development |



## Why use mcu-co?

Unlike standard Linux GPIO, which suffers from "jitter" (unpredictable delays), mcu-co ensures that your hardware reacts at the exact same time, every time. It is the bridge between the intelligence of Linux and the speed of silicon.

## Design

The following block diagram shows the high-level architecture of the mcu-co system:

{% include figure.liquid path="assets/img/mcu-co/mcu-co_block-diagram.png" class="img-fluid rounded z-depth-1" zoomable=true %}


#### MCU

The micro-controller (MCU) I decided to go with is the STM32G474RE. I chose this MCU because it is a high-performance Cortex-M4 with advanced timer peripherals capable of generating high-precision pulses and PWM, a 12-bit ADC, a built-in USB peripheral for host communication, and an independent hardware watchdog, covering the entire mcu-co feature set on a single chip.

The firmware will be a bare metal application that parses commands received from the Linux host. The physical link between the SoC and the MCU is USB CDC. I chose USB because it is portable and widely supported across Linux distributions, aligning with mcu-co's goal of being plug and play for end users.

#### Linux

On the Linux side, the software will consist of a Linux daemon, and an SDK that includes a dynamic C library, a Python package, and a command line interface. These tools are SoC agnostic and will work on any Linux-capable SoC, keeping with mcu-co's core theme of being plug and play.

#### Linux Daemon

The Linux daemon is a C program designed to be a lightweight, always-on background service that manages all communication between the Linux host and the STM32 co-processor. It abstracts the USB CDC link from the rest of the software stack, exposes a Unix socket for SDK and CLI clients, and handles multiple concurrent client connections.

#### SDK

The SDK is comprised of a dynamic C library, a Python package, and a command line interface. It allows developers to easily integrate mcu-co into their applications without needing to understand the underlying communication protocol or daemon internals. The C library targets performance-critical applications, the Python package enables rapid prototyping and scripting, and the CLI is designed for testing and field diagnostics.

#### Yocto (meta-mcu-co)

The Yocto layer (meta-mcu-co) will package the daemon and the SDK, allowing developers working with Yocto to include mcu-co in their own custom Embedded Linux images with minimal effort.

## Conclusion

I believe mcu-co is actually a super useful tool and will give Linux developers real-time control, which is something Linux is known to struggle with. With mcu-co one can offload time-critical tasks to dedicated hardware, unlocking deterministic control over GPIO, PWM, and analog signals from any Linux application without leaving the comfort of a high-level API.

mcu-co also serves as a great learning opportunity for me and for you, the reader. I plan on making this a series, so those who are interested and follow along will have the opportunity to learn a thing or two about multiple fields in embedded software, from bare-metal firmware to Linux software to Yocto development. This project will cover a lot of ground, so there is something in it for everyone. For me, this is the first time I have taken on a project of such depth and so many moving parts, it will give me the opportunity to elevate my skills as an engineer by quite a bit. I am very excited to work on this project and to share my progress with you all. In the next post I will go over the MCU firmware for the project, see you then!