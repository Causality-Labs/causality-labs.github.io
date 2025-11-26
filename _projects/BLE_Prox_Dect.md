---
layout: page
title: BLE Proximity Detector
description: Bluetooth Low Energy Proximity Detector
img: assets/img/Both_Prox_Boards.jpg
importance: 1
category: MCU
---

<h1 style="text-align: center;">Overview</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/Both_Prox_Boards.jpg" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/PC_Int_Empty.png" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="row mt-3">
    <div class="col-md-12">
        <p>The BLE proximity detector was developed in Dr. Edmond Lou's Intelligent IoT and Ultrasound lab at the University of Alberta to predict the distance of electromagnetic sensor and a probe. The system consist of two PCBs that are each equipped with an Ultra Low Power Bluetooth Low Energy (BLE) SoC called  the BlueNRG2 , and a PC based User Interface that wirelessly communicates with both of the PCBs simultaneously. The system was designed to allow for the user to track the distance of a probe to an electromagnetic sensor in real-time it also serves as means to alert the user if the probe is too close to the sensor through the use of visual and audio feedback.</p>
    </div>
</div>

<h1 style="text-align: center;">Design</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/Prox_Block_Diagram.png" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-md-6">
        <p>The diagram shows how the entire system works:</p>
        
        <p>The Power Detection Board wirelessly picks up signals from the power supply using a special antenna circuit. It converts these signals into digital data and sends it via Bluetooth to the computer interface.</p>
        
        <p>The Electromagnetic Sensor Detection Board works similarly, but connects directly to the sensor with a wire. It also converts the sensor's signals to digital data and transmits it wirelessly to the computer.</p>
        
        <p>The PC-Based User Interface receives data from both boards and calculates how far the probe is from the sensor in real-time. It provides visual and audio alerts when the probe gets too close to the sensor.</p>
    </div>
</div>

<h1 style="text-align: center;">Power Detection Board</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/Power_Board.jpg" class="img-fluid rounded z-depth-1" style="transform: rotate(90deg);" %}
    </div>
    <div class="col-md-6">
        <p>This circuit board wirelessly detects signals from the power supply using an antenna coil. The board is tuned to the power supply's frequency to capture the strongest signal possible.</p>
        
        <p>Once the signal is captured, the board processes it and converts it into digital data. A Bluetooth Low Energy chip then transmits this data wirelessly to the computer interface for analysis.</p>
    </div>
</div>

<h1 style="text-align: center;">Electromagnetic Board</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/Sensor_Board.jpg" class="img-fluid rounded z-depth-1" style="transform: rotate(90deg);" %}
    </div>
    <div class="col-md-6">
        <p>This board connects directly to the electromagnetic sensor with a wire. It receives signals from the sensor and processes them in a similar way to the Power Detection Board.</p>
        
        <p>The processed signals are converted to digital data and transmitted via Bluetooth to the computer. This allows the system to monitor the sensor's readings wirelessly in real-time.</p>
    </div>
</div>

<h1 style="text-align: center;">PC Based User Interface</h1>

<div class="row">
    <div class="col-md-12">
        {% include figure.liquid path="assets/img/PC_Interface.png" class="img-fluid rounded z-depth-1" %}
    </div>
</div>
<div class="row mt-3">
    <div class="col-md-12">
        <p>The computer application receives data from both circuit boards wirelessly and uses it to calculate the real-time distance between the probe and the sensor.</p>
        
        <p>The interface provides visual feedback through a color-changing LED indicator and audio feedback with a pitch that increases as the probe gets closer to the sensor. Users can adjust settings and customize the distance calculation model on the fly for different use cases.</p>
    </div>
</div>

