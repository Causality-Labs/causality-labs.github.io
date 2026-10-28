---
layout: post
title: Understanding the RPMsg architecture (smartsight P2)
date: 2026-10-21 09:40:16
description: A look at how RPMsg lets the Cortex-A53 cores and the Cortex-M7 on the i.MX 8M Plus talk to each other.
tags: Embedded-Linux MCU
categories: smartsight
thumbnail: assets/img/blogs/smartsight.png
---

## Introduction
In this post I will go over the fundamentals of the RPsg framework and how utilize it in the smartsight project. RPMsg (Remote Processor Messaging) is a standard, shared-memory-based messaging bus that enables low-latency Inter-Processor Communication (IPC) between heterogeneous cores in an asymmetric multiprocessing (AMP) architecture. It is how we will be getting our cortex-A53 core cluster to communicate with our cortex-M7 core.

## How RPMsg works
RPMsg is built as a three-layer stack. At the bottom is the physical layer: a region of shared memory plus an inter-core interrupt that lets one core notify the other (on i.MX parts this is the Messaging Unit, or MU). Above that is the media access layer, VirtIO, which manages vrings, the ring buffers in shared memory that pass message buffers between the cores. At the top is RPMsg itself, the transport layer, which adds addressing through endpoints and named channels so drivers on each side can send and receive messages.

{% include figure.liquid path="assets/img/smartsight/rpmsg-layers.png" class="img-fluid rounded z-depth-1" zoomable=true %}

#### Physical Layer
The Physical Layer is comprised of two things shared memory and inter core interrupts(A Mailbox Unit (MU)).

- shared memory: A location DDR RAM that is accessible by both cores, its where each core writes data to and reads data from.

- inter core interrupts: A hardware signal one core sends to interrupt another. It's how one side of RPMsg tells the other "I've put something in shared memory for you".

{% include figure.liquid path="assets/img/smartsight/rpmsg-physical-layer.png" class="img-fluid rounded z-depth-1" zoomable=true %}

#### Media Access Control Layer (MAC)
The Media Access Control layer is implemented by VirtIO and manages access to the shared memory using vrings, ring buffers that pass message buffers back and forth between the two cores, one for each direction.

The MAC layer is implemented by VirtIO, whiich is a standard for passing data between two sides that share memory. It was originally created for virtual machines: instead of emulating real hardware, a VM and its host exchange data through shared memory using an agreed set of rules. RPMsg reuses that standard. To Linux, the M7 looks like a VirtIO device, so the same well-tested code handles the communication. Vring uses a data structure called vring to do this, vring is a ring buffer that lives in shared memory. It doesn't hold the messages themselves. It holds small entries that point to message buffers, and it has three parts:

{% include figure.liquid path="assets/img/smartsight/virtio-vring.png" class="img-fluid rounded z-depth-1" zoomable=true %}

{% include figure.liquid path="assets/img/smartsight/virtio-descriptor.png" class="img-fluid rounded z-depth-1" zoomable=true %}

- Address: the physical address of the buffer in RAM.
- Length: the length of the buffer in bytes.
- Flags: a set of bits that describe the buffer:
    - NEXT bit: tells us that the next field holds the index of the following buffer descriptor in the buffer descriptor table.
    - WRITE bit: marks the buffer as one the other side should write data into, rather than read data from. For example, an empty buffer handed over to be filled with a reply.
    - INDIRECT bit: tells us that the buffer contains its own buffer descriptor table instead of data, allowing many buffers to be described using just one entry in the buffer descriptor table.
- Next: the index of the next buffer descriptor in the buffer descriptor table. It is only used when the NEXT bit is set.


{% include figure.liquid path="assets/img/smartsight/virtio-available-ring.png" class="img-fluid rounded z-depth-1" zoomable=true %}

Available ring: a ring buffer that one side writes to hand buffers over to the other side, telling it which buffers are ready to be used. It holds the following fields:

- Flags: a set of bits the writer uses to give hints to the other side. For example, the NO_INTERRUPT bit tells the other side that it doesn't need to send an interrupt when it has finished with a buffer.
- Idx: a counter of how many entries the writer has added to the ring in total. It tells the other side where the next entry will go.
- Ring: an array where each slot holds a 16-bit index into the buffer descriptor table, pointing to a buffer that is ready.

{% include figure.liquid path="assets/img/smartsight/virtio-used-ring.png" class="img-fluid rounded z-depth-1" zoomable=true %}

Used ring: similar to the available ring, but this is the one the other side writes to hand buffers back once it is done with them. It holds the following fields:

- Flags: a set of bits the writer uses to give hints to the other side. For example, the NO_NOTIFY bit tells the other side that it doesn't need to send an interrupt when it adds new buffers to the available ring.
- Idx: a counter of how many entries the writer has added to the ring in total. It tells the other side where the next entry will go.
- Ring: an array where each slot holds two values instead of one like the available ring: the index of the buffer's descriptor in the buffer descriptor table, and the number of bytes that were written into the buffer.


#### Transport Layer

The VirtIO MAC layer is bookkeeping: it tracks the shared buffers (where each one is, its size, and which core currently owns it) and defines how buffers are passed between the cores. It never looks inside them.

The RPMsg transport layer defines what goes inside each buffer and delivers it to the right endpoint. The transport layer looks like this:

{% include figure.liquid path="assets/img/smartsight/rpmsg-transport-buffer.png" class="img-fluid rounded z-depth-1" zoomable=true %}

It consists of the following:

- Source address (32-bit): the sending endpoint
- Destination address (32-bit): the receiving endpoint
- Reserved (32-bit)
- Length (16-bit): payload size in bytes
- Flags (16-bit): Currently unused by RPMsg and is reserved.
- Payload: the actual data being sent

The transport layer is also comprised of an RPMsg channel and RPMsg endpoint:

An RPMsg channel is a named connection between a remote core and the host core, such as "rpmsg-tty" or "sensor-service". Its comprised of three things:
- A name for the channel (sensor service)
- Local Address (Source Address)
- Remote Address (Destination Address)

Each core can have multiple channels.

An RPMsg endpoint is a logical address that a core uses to send and receive messages, similar to a port number in networking. It's comprised of two things:

- Address: a 32-bit number that uniquely identifies the endpoint on its core. Every RPMsg message carries a source address and a destination address, which is how RPMsg knows which endpoint a message came from and which endpoint should receive it.
- Callback: a function that gets called whenever a message arrives at the endpoint's address. This is where the application handles the incoming data.

You can have multiple endpoints in a channel

An example configuration of a channel and endpoint can look like this:

{% include figure.liquid path="assets/img/smartsight/rpmsg-channels-endpoints.png" class="img-fluid rounded z-depth-1" zoomable=true %}

In the diagram, our remote core, the M7, has two channels: temp-sensor and motor-ctrl. Each channel has two endpoints. The temp-sensor channel has endpoint 30 for handling temperature requests and endpoint 31 for sending alarms, while the motor-ctrl channel has endpoint 40 for receiving motor commands and endpoint 41 for reporting faults. Linux, our host, has a matching set of channels, and each of its endpoints is paired with one on the M7. For example, Linux's endpoint 1024 talks to the M7's endpoint 30.

When Linux wants the current temperature, it sends a message from its endpoint 1024 to the M7's endpoint 30 (Buffer 1). The M7's temp_req_cb() callback runs, and the M7 replies from endpoint 30 back to endpoint 1024 with the reading (Buffer 2). Notice that the buffers only carry the source and destination addresses, not the channel name. The channel name is only used when the channel is first set up. After that, the addresses are all RPMsg needs to deliver each message to the right callback.
