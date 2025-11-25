---
layout: page
title: BLE Proximity Detector
description: Bluetooth Low Energy Proximity Detector
img: assets/img/Both_Prox_Boards.jpg
importance: 1
category: MCU
related_publications: true
---

# Overview

The BLE proximity detector was developed in Dr. Edmond Lou's Intelligent IoT and Ultrasound lab at the University of Alberta to predict the distance of electromagnetic sensor and a probe. The system consist of two PCBs that are each equipped with an Ultra Low Power Bluetooth Low Energy (BLE) SoC called  the BlueNRG2 , and a PC based User Interface that wirelessly communicates with both of the PCBs simultaneously. The system was designed to allow for the user to track the distance of a probe to an electromagnetic sensor in real-time it also serves as means to alert the user if the probe is too close to the sensor through the use of visual and audio feedback.

# Design

![Block Diagram](/assets/img/Prox_Block_Diagram.png)
On the left is a block diagram of the entire system and it works as follows:
The Power Detection Board receives utilizes an LC resonant circuit to wirelessly pickup a signal coming from the power supply.  That signal is then is passed through  analog circuit that converts that analog signal into a digital signal  that is sampled  by the BlueNRG2-M2SA RF module which has RF Ceramic Antenna  to wirelessly transmit that data to the PC-Based User Interface.

The Electromagnetic Sensor Detection Board also follows a similar topology to the Power Detection Board, however it has a wired connection to the Electromagnetic Sensor.  The signal received from the sensor also passes through to an analog circuit that converts the signal received from the sensor to a digital signal that is sampled by another BlueNRG2-M2SA RF module that wirelessly transmits the signal to the PC-based User Interface.

The PC-Based User Interface receives the data about the Power Supply and the Electromagnetic Sensor  wirelessly, from the data received it calculates the distance of the probe from the sensor  and displays it to the user. It also features visual feedback and audio feedback to alert the user that the probe is getting too close to the sensor.

# Power Detection Board

This PCB is comprised of analog and digital circuitry, the analog circuity is made up of an LC resonant circuit that has a voltage induced in it wirelessly  by the current passing through the wires that connect the probe to the power supply. The LC circuit was tuned to operate at the resonant frequency of the power supply so the maximum voltage would be received. The rest of the analog circuitry is made up of op amps configured as a comparator and an  inverting amplifier that serve to make the received signal processable by the BlueNRGM2SA module.  The BlueNRG M2SA  module  was programmed in C and it samples the newly converted signal with its built Analog to Digital Converter (ADC) and with its bult in BLE C Stack Library it transmits data relating to the signal to the PC based User Interface for further processing.

# Electromagnetic Board

This PCB is comprised of analog and digital circuitry, the analog circuity is made up of an LC resonant circuit that has a voltage induced in it wirelessly  by the current passing through the wires that connect the probe to the power supply. The LC circuit was tuned to operate at the resonant frequency of the power supply so the maximum voltage would be received. The rest of the analog circuitry is made up of op amps configured as a comparator and an  inverting amplifier that serve to make the received signal processable by the BlueNRGM2SA module.  The BlueNRG M2SA  module  was programmed in C and it samples the newly converted signal with its built Analog to Digital Converter (ADC) and with its bult in BLE C Stack Library it transmits data relating to the signal to the PC based User Interface for further processing.


# PC Based User Interface

The PC based user interface is a  multithreaded C# WinForms  .NET Framework that receives both signals incoming from both boards, with the data acquired  the program  enters both of these values to a distance detection prediction model that calculates the distance of probe from the sensor and displays it for the user to track. Moreover, the interface offers visual feedback through a dynamic digital LED that changes color in correspondence with the probe's location relative to the sensor. Additionally, it provides audio feedback in the form of a variable frequency pitched noise, the frequency of which increases as the probe approaches closer to the sensor. The user can customize various settings on the board, and adjust the distance detection prediction model. This enables convenient on-the-fly configurations for enhanced accessibility and adaptability.

