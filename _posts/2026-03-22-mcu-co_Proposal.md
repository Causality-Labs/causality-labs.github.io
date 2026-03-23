---
layout: post
title: mcu-co Proposal (mcu-co P1)
date: 2026-03-22 09:40:16
description: Introducing mcu-co, a professional-grade real-time I/O accelerator that bridges a Linux host to a dedicated co-processor for deterministic hardware execution
tags: Embedded-Linux MCU
categories: Yocto
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## What is mcu-co

mcu-co is a professional-grade, real-time I/O accelerator that bridges a Linux host to a dedicated co-processor. It provides deterministic hardware execution by offloading time-critical tasks from the Linux kernel to dedicated hardware, all accessible via C and Python SDKs.

## Core Features

### Digital I/O

- **Standard GPIO** — high-speed pin state manipulation (High/Low) and input sensing
- **Bounded Features** — logic-locked pins that react to internal states without software intervention
- **Precision Pulses** — single or repeating pulses with nanosecond-level accuracy

### PWM & Analog Control

- **Advanced PWM** — jitter-free pulse-width modulation for motor control and power electronics
- **ADC** — single-shot analog reads, streaming is planned for future releases

### Safety & Reliability

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