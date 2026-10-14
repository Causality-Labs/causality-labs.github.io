---
layout: post
title: The smartsight project
date: 2026-10-12 09:40:16
description: Introducing smartsight, real-time object tracking on a heterogeneous i.MX8MP (A53 + NPU + M7).
tags: Embedded-Linux MCU
categories: smartsight
thumbnail: assets/img/blogs/smartsight.png
---

## What is smartsight?
smartsight is a pan/tilt smart camera built on the NXP FRDM-i.MX8MP. It detects objects with an on-device neural network and physically turns to keep them in frame, all on the edge. I have been very interested in heterogeneous systems for a long time, so I thought up the idea of smartsight because it gives me the opportunity to design a system and optimize it on a heterogeneous platform. This project will also give me experience working with edge ML, which I will be using for the object detection, and because I will be working with a camera, it will give me the chance to work with the V4L2 subsystem.

The hardware I will be using for this project is NXP's i.MX 8M Plus SoC on the FRDM development board, which I chose because it offers great heterogeneous compute. It comes with a cluster of four Arm Cortex-A53 cores running at 1.8 GHz, one Arm Cortex-M7 running at 800 MHz, and an NPU rated at 2.3 TOPS. This board is built for handling application-level logic on its Cortex-A53 cores, real-time tasks on its M7 core, and ML on the NPU, making it a fantastic platform for smartsight.

## Core Features
Below are the features I currently have planned for this project. These are subject to change, as once I actually start building, I may find that the way I planned to implement some features is not optimal and needs rethinking.

#### Object Detection
Real-time object detection is one of the main features of smartsight. Detection will run on a neural network accelerated by the i.MX 8M Plus NPU. I will start with something simple, like detecting people, and may expand to other objects in the future.

#### Object Tracking
In addition to object detection, smartsight will also track objects. Since it is a pan/tilt camera, it will be able to pan and tilt to keep the tracked object in frame. I plan to do this by using the M7 core on the i.MX 8M Plus SoC to control the servos via PWM signals.

#### Sending Video over the network
I want smartsight to be able to send video data over a network. Whether the video is streamed live or recorded, saved on the device, and sent later is yet to be decided, but one way or another, it should be able to share its video over the network.

## Design

{% include figure.liquid path="assets/img/blogs/smartsight-block-diagram.svg" class="img-fluid rounded z-depth-1" zoomable=true %}

The diagram above shows the high-level design of smartsight and how the work is split across the FRDM-i.MX8MP.

A USB camera feeds frames into the Cortex-A53 cluster, which runs Linux and handles the vision side of the system. The A53 cores capture each frame and pass it to the NPU, which runs the object detection model and returns the results. Using those detections, the A53 cores work out where the camera needs to point to keep the object in frame.

That target position is then sent to the Cortex-M7 over RPMsg. The M7 runs FreeRTOS and is dedicated to motor control, generating the PWM signals that drive the pan/tilt servos. Keeping this on the M7 means the servos get deterministic timing, regardless of how busy Linux is. As the servos move, they move the camera with them, which closes the loop: the next frame reflects the new position, and the cycle repeats.

Alongside this, the A53 cores also send video to a network client, so the camera's view can be watched from another device.

## Conclusion

smartsight brings together the three parts of the i.MX 8M Plus: Linux on the Cortex-A53 cores for vision, the NPU for object detection, and FreeRTOS on the Cortex-M7 for real-time motor control. Each part of the system runs where it fits best, which is exactly the kind of heterogeneous design I wanted to explore with this project.

This post covered what smartsight is, its core features, and its high-level design. In the upcoming posts, I will document the build step by step, starting with getting the Cortex-M7 up and running. As I mentioned earlier, some of these plans may change along the way, and I will share what I learn as the project develops.

{% include figure.liquid path="assets/img/blogs/smartsight.png" class="img-fluid mx-auto d-block" width="30%" %}
