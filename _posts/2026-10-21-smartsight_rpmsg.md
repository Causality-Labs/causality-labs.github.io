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

## Linking it all up

{% include figure.liquid path="assets/img/smartsight/rpmsg-system.png" class="img-fluid rounded z-depth-1" zoomable=true %}

Now we are going to connect all the dots, in the diagram above we can see al the pieces connected, also one thing to not is that we have two vrings one for linux to talk to the M7 core and the other is for the m7 core to talk to linux

{% include figure.liquid path="assets/img/smartsight/rpmsg-endpoints-buffers.png" class="img-fluid rounded z-depth-1" zoomable=true %}

The diagram shows how endpoints use message buffers in shared memory to talk to each other. To send a message, an endpoint calls a send function: `rpmsg_send()` on the Linux side, or `rpmsg_lite_send()` on the M7 side. The message is written into a buffer along with a small header containing the source address (`src`), the destination address (`dst`), and the length of the message. RPMsg then uses the destination address to deliver the buffer to the right endpoint on the other core, which runs that endpoint's callback to handle the message.

For example, Linux's endpoint 1024 calls `rpmsg_send()` to send `"GET_TEMP"` to the M7's endpoint 30, which runs `temp_req_cb()` to handle the request. In the other direction, the M7's endpoint 31 calls `rpmsg_lite_send()` to send `"OVERHEAT"` to Linux's endpoint 1025, which runs `on_alarm()`. Channel B works the same way: endpoint 1026 sends `"SPEED 120"` to endpoint 40, which runs `motor_cmd_cb()`.

Now we will connect the the MAC layers vring to the transport layer. As seen in the diagrams below:

vring0 (M7 to Linux)
{% include figure.liquid path="assets/img/smartsight/rpmsg-vring0.png" class="img-fluid rounded z-depth-1" zoomable=true %}

Below is the flow of communication in this ring.
- Linux posts empty buffers by writing their descriptor numbers into the available ring
- The M7 reads the available ring to get one of those buffers: slot → descriptor number
- The M7 writes the message into that buffer: header (src, dst, len) and payload.
- The M7 writes that descriptor number into the used ring
- The M7 rings the MU
- Linux wakes up and reads the used ring to find the buffer, then reads the message and runs the endpoint’s callback.
- Linux acknowledges by re-posting the buffer into the available ring as an empty buffer.

vring1 (Linux to M7)
{% include figure.liquid path="assets/img/smartsight/rpmsg-vring1.png" class="img-fluid rounded z-depth-1" zoomable=true %}

Below is the flow of communication in this ring.
- Linux takes a free buffer from its own memory pool.
- Linux writes the message into it: header (src, dst, len) and payload.
- Linux writes the descriptor number into the available ring, meaning “here’s a message for you.”
- Linux rings the MU.
- The M7 wakes up and reads the available ring to find the buffer.
- The M7 reads the header, finds the endpoint matching dst, and runs its callback with the payload.
- The M7 writes the descriptor number into the used ring, meaning “done, you can have it back.”

Now we will go over actually messages as an example:

#### Example: Sending "GET_TEMP" from Linux to the M7

Linux's endpoint 1024 sends `"GET_TEMP"` to the M7's endpoint 30. Messages in this direction travel on vring 1, where Linux fills the buffers itself and the M7 only reads them.

**Before:** nothing to set up. Linux keeps its own pool of free buffers, so it doesn't need to post empty ones in advance.

1. **Linux gets a buffer:** it takes the buffer at `0x55420000` from its free pool and describes it with `desc[0]`.
2. **Linux writes the message:** `src 1024` · `dst 30` · `len 8` · `"GET_TEMP"`.
3. **Linux hands it over:** it writes `0` into the available ring (`avail[0] = 0`, `avail.idx = 1`).
4. **Linux notifies the M7:** it rings the MU, which interrupts the M7.
5. **M7 finds the message:** `avail[0] = 0` points to `desc[0]` and the buffer at `0x55420000`.
6. **M7 delivers it:** `dst 30` selects the endpoint, and its callback runs with `"GET_TEMP"`.
7. **M7 gives the buffer back:** it writes `{id 0}` into the used ring (`used.idx = 1`).


#### Example: Sending "OVERHEAT" from the M7 to Linux

The M7's endpoint 31 sends `"OVERHEAT"` to Linux's endpoint 1025. Messages in this direction travel on vring 0, where Linux supplies the empty buffers and the M7 fills them.

**Before:** Linux has already posted empty buffers `desc[0]`–`desc[3]` into the available ring (`avail.idx = 4`).

1. **M7 gets a buffer:** it reads `avail[0] = 0`, which points to `desc[0]` and the buffer at `0x55400000`.
2. **M7 writes the message:** `src 31` · `dst 1025` · `len 8` · `"OVERHEAT"`.
3. **M7 hands it over:** it writes `{id 0, len 24}` into the used ring (`used.idx = 1`).
4. **M7 notifies Linux:** it rings the MU, which interrupts Linux.
5. **Linux finds the message:** `used[0]` points to `desc[0]` and the buffer.
6. **Linux delivers it:** `dst 1025` selects the endpoint, and its callback runs with `"OVERHEAT"`.
7. **Linux gives the buffer back:** it re-posts the empty buffer into the available ring (`avail[4] = 0`).
8. **Linux notifies the M7:** it rings the MU to tell the M7 another empty buffer is ready.

## Connecting it back to the Device Tree

NOw that we have gone over how the stack and how messages flow throught both vrings, we can take a second look at the how rpmsg is setup in the dts file:

{% highlight c linenos %}
// SPDX-License-Identifier: (GPL-2.0 OR MIT)
/*
 * i.MX8MP FRDM with the Cortex-M7 enabled for remoteproc/RPMsg.
 *
 * Based on imx8mp-frdm.dts; only the generic RPMsg pieces of NXP's
 * imx8mp-frdm-rpmsg.dts are carried over (not its audio offload setup).
 */

/dts-v1/;

#include "imx8mp-frdm.dts"

/ {
    model = "Causality Labs i.MX8MP FRDM";

    reserved-memory {
        #address-cells = <2>;
        #size-cells = <2>;
        ranges;

        /* M7 code/data when the firmware is linked to run from DDR */
        m7_reserved: m7@80000000 {
            reg = <0 0x80000000 0 0x1000000>;
            no-map;
        };

        /* Must match the M7 firmware's rsc_table.c / linker script */
        vdev0vring0: vdev0vring0@55000000 {
            reg = <0 0x55000000 0 0x8000>;
            no-map;
        };

        vdev0vring1: vdev0vring1@55008000 {
            reg = <0 0x55008000 0 0x8000>;
            no-map;
        };

        rsc_table: rsc-table@550ff000 {
            reg = <0 0x550ff000 0 0x1000>;
            no-map;
        };

        vdevbuffer: vdevbuffer@55400000 {
            compatible = "shared-dma-pool";
            reg = <0 0x55400000 0 0x100000>;
            no-map;
        };
    };

    imx8mp-cm7 {
        compatible = "fsl,imx8mp-cm7";
        rsc-da = <0x55000000>;
        clocks = <&clk IMX8MP_CLK_M7_DIV>,
                 <&audio_blk_ctrl IMX8MP_CLK_AUDIOMIX_AUDPLL_ROOT>;
        clock-names = "core", "audio";
        mbox-names = "tx", "rx", "rxdb";
        mboxes = <&mu 0 1
                  &mu 1 1
                  &mu 3 1>;
        memory-region = <&vdevbuffer>, <&vdev0vring0>, <&vdev0vring1>, <&rsc_table>, <&m7_reserved>;
        fsl,startup-delay-ms = <500>;
        status = "okay";
    };
};

/*
 * Peripherals owned by the M7 must be disabled on the Linux side.
 * UART4 is the usual M7 debug console; add others (i2c3, ecspi2,
 * flexcan1, pwm4, ...) here as the M7 firmware starts using them.
 */
&uart4 {
    status = "disabled";
};
{% endhighlight %}

We'll focus only on the parts of the device tree that relate to RPMsg. Here are the points to focus on:

**Shared memory: `reserved-memory`**

| Node | Address · Size | Where it fits |
|------|----------------|---------------|
| `vdev0vring0` | `0x55000000` · 32 KB | vring 0 (M7 → Linux) |
| `vdev0vring1` | `0x55008000` · 32 KB | vring 1 (Linux → M7) |
| `vdevbuffer` | `0x55400000` · 1 MB | The message buffers the descriptors point to |
| `rsc_table` | `0x550ff000` · 4 KB | The resource table, where the M7 firmware tells Linux where its vrings are |

`no-map` stops Linux from using these regions as ordinary memory, since the M7 reads and writes them too. The vring addresses must match the M7 firmware's resource table, or no RPMsg channel will appear.

**The M7 and the MU: `imx8mp-cm7`**

- `memory-region` hands the regions above to the driver that starts the M7.
- `mboxes` connects the MU channels (`tx`, `rx`, `rxdb`), which are the doorbells each side rings after updating a ring.
