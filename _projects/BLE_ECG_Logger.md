---
layout: page
title: BLE ECG Logger (January 2024)
description: Award-winning Bluetooth Low Energy ECG monitoring system that captures and wirelessly transmits heart activity data - 1st Place Winner at HackED 2024 Hackathon
img: assets/img/Both_Prox_Boards.jpg
importance: 1
category: MCU
---

<h1 style="text-align: center;">Overview</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/BLE_Prox_Dect_img/Both_Prox_Boards.jpg" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="row mt-3">
    <div class="col-md-12">
        <p>The BLE ECG logger was developed for HackED 2024, which is the biggest student led hackathon in Alberta  hosted by the Computer Engineering Department  of the University of Alberta.  The BLE ECG logger is a biophysical instrumentation device that reads the electrical signal of a user's heart  and provides the user with an electrodiagram  on a PC based User Interface. The system consists of an analog circuit (Instrumentation amplifier) that reads the patients electrical signal. A MCU with BLE (BlueNRG 2) to sample the signal from the analog circuit and transmit the sampled signal wirelessly while also making use of a buzzer that beeps every time the user's heart beats. And a PC based User Interface to the receive the signal wirelessly and for real time ECG plotting.</p>
    </div>
</div>

<h1 style="text-align: center;">Design</h1>

<div class="row">
    <div class="col-md-12">
        {% include figure.liquid path="assets/img/BLE_Prox_Dect_img/Prox_Block_Diagram.png" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-md-6">
        <p>As you can see from the block diagram the BLE ECG data logger is comprised of three subsystems the Instrumentation Amplifier Circuit, BlueNRG-2 MCU and a PC-Based user Interface. </p>
        
        <p> The Instrumentation Amplifier is comprised of three op amps that are connected to three electrode pads that are placed on the user's body. This circuit is able to read the electric signals that the heart generates across the users body.</p>
        
        <p>The BlueNRG-2 is an ultra low power SoC that has Bluetooth Low Energy(BLE) capabilities, this SoC was used to sample the analog signal from the Instrumentation Amplifier making use of its 10 bit Analog to Digital Converter (ADC). The BlueNRG-2 SoC was also responsible for processing the signal and supplying a voltage to a buzzer to simulate the user's heart beat whilst also transmitting the sampled data wirelessly via BLE to the PC Based User Interface. The PC based User Interface wirelessly receives data from the BlueNRG-2 and plots a real time ECG.</p>
    </div>
</div>

<h1 style="text-align: center;">Power Detection Board</h1>

<div class="row">
    <div class="col-md-6">
        <div style="transform: rotate(90deg); transform-origin: center;">
            {% include figure.liquid path="assets/img/BLE_Prox_Dect_img/Power_Board.jpg" class="img-fluid rounded z-depth-1" %}
        </div>
    </div>
    <div class="col-md-6">
        <p>This circuit board wirelessly detects signals from the power supply using an antenna coil. The board is tuned to the power supply's frequency to capture the strongest signal possible.</p>
        
        <p>Once the signal is captured, the board processes it and converts it into digital data. A Bluetooth Low Energy chip then transmits this data wirelessly to the computer interface for analysis.</p>
    </div>
</div>

<h1 style="text-align: center;">Electromagnetic Board</h1>

<div class="row">
    <div class="col-md-6">
        <div style="transform: rotate(90deg); transform-origin: center;">
            {% include figure.liquid path="assets/img/BLE_Prox_Dect_img/Sensor_Board.jpg" class="img-fluid rounded z-depth-1" %}
        </div>
    </div>
    <div class="col-md-6">
        <p>This board connects directly to the electromagnetic sensor with a wire. It receives signals from the sensor and processes them in a similar way to the Power Detection Board.</p>
        
        <p>The processed signals are converted to digital data and transmitted via Bluetooth to the computer. This allows the system to monitor the sensor's readings wirelessly in real-time.</p>
    </div>
</div>

<h1 style="text-align: center;">PC Based User Interface</h1>

<div class="row">
    <div class="col-md-12">
        {% include figure.liquid path="assets/img/BLE_Prox_Dect_img/PC_Interface.png" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="row mt-3">
    <div class="col-md-12">
        <p>The computer application receives data from both circuit boards wirelessly and uses it to calculate the real-time distance between the probe and the sensor.</p>
        
        <p>The interface provides visual feedback through a color-changing LED indicator and audio feedback with a pitch that increases as the probe gets closer to the sensor. Users can adjust settings and customize the distance calculation model on the fly for different use cases.</p>
    </div>
</div>

