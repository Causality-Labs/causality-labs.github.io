---
layout: page
title: Causality SoC (June 2025 - August 2025)
description: Custom FPGA SoC on Basys 3 using Verilog and C, featuring a flexible HAL and Snake game demo
img: assets/img/Causality_SoC/snake_demo.gif
importance: 1
category: FPGA
---

<h1 style="text-align: center;">Overview</h1>

<div class="row">
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/Causality_SoC/static_snake.jpg" class="img-fluid rounded z-depth-1 even-height-img" %}
    </div>
    <div class="col-sm mt-3 mt-md-0">
        {% include figure.liquid path="assets/img/Causality_SoC/basys3.jpg" class="img-fluid rounded z-depth-1 even-height-img" %}
    </div>
</div>
<div class="row mt-3">
    <div class="col-md-12">
        <p>The Causality SoC (System on Chip) is my personal project inspired by <a href="https://www.arm.com/resources/education/education-kits/introduction-to-soc" target="_blank" rel="noopener">Arm’s Introduction to SoC course</a>. After completing the course, I designed a custom SoC on the Digilent Basys 3 FPGA using HDL and built a Hardware Abstraction Layer (HAL) with clean, reusable APIs for the on-chip peripherals. The goal was to create a flexible, easy to use SoC that can be extended with new peripherals, drivers, and applications—whether that means adding I²C/SPI, integrating a minimal RTOS, or building custom software. It is aimed at developers who want to prototype new ideas, as well as students and enthusiasts interested in learning how embedded systems work.</p>

        <p>This project can be split into two sections the Hardware implementation in which I used a Hardwar description language specifically Verilog to design the SoC and the Software implementation in which I used C to program drivers to control the on chip peripherals and to demonstrate the capabilities of the SoC I  wrote a program to run the popular Snake game on the SoC.</p>

        <p>Source code of this project can be found here: <a href="https://github.com/Causality-Labs/Causality_SoC" target="_blank" rel="noopener">Causality SoC</a>.</p>
    </div>
</div>

<h1 style="text-align: center;">Hardware</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/Causality_SoC/HW_block.png" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-md-6">
        <p>The Causality SoC was written in Verilog  in the Vivado Design suite and is  made up of the following parts:</p>

        <p><strong>ARM Cortex-M0 Processor:</strong> The main CPU core that executes programs. </p>

        <p><strong>AHB-Lite Bus (AHB Decoder and AHBMUX):</strong> The interconnect that links the processor with memory and peripherals.</p>

        <p><strong>BRAM:</strong> On-chip memory for program instruction and data storage.</p>

        <p><strong>UART:</strong> Serial communication for debugging or connecting to external devices.</p>

        <p><strong>VGA:</strong> Generates video output for display.</p>

        <p><strong>Timer:</strong> Free-run, periodic, compare, PWM, and capture mode.</p>

        <p><strong>GPIO:</strong> General-purpose input/output for LEDs, switches, and other simple I/O.</p>

        <p><strong>4-digit Seven-Segment Display:</strong> Used to display numbers or status information in hexadecimal or decimal format.</p>
    </div>
</div>

<h1 style="text-align: center;">Software</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/Causality_SoC/SW_block.png" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-md-6">
        <p>The software implementation was developed in C  using the Keil Uvision 5 IDE and  project is comprised of the following parts:</p>

        <p><strong>SoC HAL:</strong> A hardware abstraction layer that provides low-level drivers to interface with the on-chip peripherals.</p>

        <p><strong>SoC API:</strong> A higher-level programming interface built on top of the HAL, offering clean and reusable functions for application development.</p>

        <p><strong>Application:</strong> Example programs demonstrating how to use the SoC, including a Snake game that showcases the peripherals in action.</p>
    </div>
</div>

<h1 style="text-align: center;">Demo</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/Causality_SoC/snake_demo.gif" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-md-6">
        <p>With the Causality SoC, you can easily write applications such as the classic Snake game and many more. Using the provided C APIs and Hardware Abstraction Layers, developers can interact with the FPGA-based hardware at a high level, without worrying about low-level register details. This makes it straightforward to build interactive applications, test new ideas, or prototype custom software directly on the SoC.</p>
    </div>
</div>

<h1 style="text-align: center;">Conclusion</h1>

<div class="row">
    <div class="col-md-12">
        <p>In the future I would like to add I2C, SPI and write more demo programs that will make use of those serial communication protocols or a minimal RTOS. Please feel free to fork the repo for the source and add or customize the hardware or write more application programs!! That is the beauty of this project: you are free to add or change the hardware and, with a few tweaks to the HAL, keep the same software running—so experiment, share what you build, and send a PR with examples and notes for others to learn from!</p>
    </div>
</div>