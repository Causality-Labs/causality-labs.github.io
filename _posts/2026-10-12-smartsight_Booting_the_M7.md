---
layout: post
title: Adding Cortex-M7 support to the FRDM-i.MX8MP BSP (smartsight P1)
date: 2026-10-12 10:40:16
description: How to add Cortex-M7 support to the FRDM-i.MX8MP Yocto BSP so Linux can boot and talk to the M7 core.
tags: Embedded-Linux MCU
categories: smartsight
thumbnail: assets/img/blogs/smartsight.png
---

## Introduction
In this post, I will go over how I got the M7 core to boot using my own custom Yocto layer. Bringing up the core involves enabling its kernel driver, adding it to the device tree, tweaking some settings in U-Boot, and using the remoteproc framework to get it up and running.

## Why the M7?
I am planning to use the M7 core to control the pan/tilt servos for smartsight. There are simpler, less rigorous ways to control the servos. For example, you could drive the PWM peripherals from userspace in Linux or use a dedicated PWM controller chip. However, I have always been fascinated by heterogeneous systems and asymmetric multiprocessing, and I really wanted to learn how to design systems like this, so I decided to take this route. You can see glimpses of this interest in my last project, mcu-co, but for this project, I decided to keep everything on a single chip.

## How Cortex-A53 cores and the M7 Share the SoC
Because the Cortex-A53 core cluster and the M7 share the same  Silicoln it means they also share a number of resources like memory and different hardware peripherals.
#### Memory
Going through the imx8mp reference maual here is the memory subsystem for the core cluster and the m7 core:

{% include figure.liquid path="assets/img/smartsight/imx8mp-cores-memory.png" class="img-fluid rounded z-depth-1" zoomable=true %}

Each system has its own cache and it can be broken down to this:
Cortex-A53 Cluster:
• Level 1 Cache (4x per Cortex-A53 Core)
    • Instruction (32 KB)
    • Data (32 KB)
• Level 2 Cache, shared by the four Cortex-A53 cores:
    • Unified instruction and data (512 KB)

Cortex-M7:
• Cache
    • Instruction (32 KB)
    • Data (32 KB)
• Tightly-Coupled-Memory
    • Data Tightly Coupled Memory (DTCM) (128KB)
    • Instruction Tightly Coupled Memory (ITCM) (128KB)

You might be curious as to what Tightly Coupled Memory is, I will explain it now. Tightly Coupled Memory (TCM) is a  small block of SRAM wired directly to the m7 processor core, sitting right next to it instead of out on the shared system bus. The core can read and write it at full clock speed, usually in a single cycle, every time. Making for faster access to instructions and data stored in this memory structure. The rest of the on chip SRAM is accesed by the bus and is shared by the A53 cores and the M7 core.


The Cortex-A53 cluster is the only one with access to the SoC's boot ROM, but both core systems can access the different types of RAM, including DRAM and on-chip RAM. However, because the Cortex-M7 is a 32-bit processor and the Cortex-A53s are 64-bit processors, some parts of DRAM are not accessible to the Cortex-M7.


#### Peripherals

{% include figure.liquid path="assets/img/smartsight/imx8mp-cores-peripherals.png" class="img-fluid rounded z-depth-1" zoomable=true %}

The M7 core and A-53 core cluster are able to talk to most of the peripherals on the SoC, as they share mostly the same register map. The easiest way to garuntee access to the m7 core is to disable the peripheral in the device tree source file as then Linux would not be able to probe the peripheral.

Here's a fun fact: the Cortex-M7 can actually talk to the NPU. Its registers and interrupt are right there in the M7's memory map. The catch is that NXP's NPU software only exists for Linux, so getting the M7 to use it means writing the driver yourself. Maybe a future project for me, if I'm ever that curious (or hate myself enough, haha).

## Prerequisites
To keep my life simple I am using the NXP SDK for my Yocto work, and the default frdm imx8mp build does not come with the m7 core working out of the box. So I have to enable it in the device tree first before I can do any more work. Remote proc is set upo by default to work in the NXP SDK, it just was not set up in the device tree.
## Adding M7 Support to the BSP
#### Device Tree
There is a device tree set up for the m7 core that we can use for reference which can be found here []. I copied it into my own bsp layer in meta-causality-labs called meta-causality-imx. Here is what the device tree looks like :

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
        memory-region = <&vdevbuffer>, <&vdev0vring0>, <&vdev0vring1>, <&rsc_table>;
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

As you can see above, we include the base `imx8mp-frdm.dts` and then describe only the parts we are interested in. Let's start with the `reserved-memory` node.

In this node, we're telling Linux that there are portions of DDR RAM it isn't allowed to use, because they're set aside for the M7 and the RPMsg buffers the two cores share.

Now let's see how this device tree lines up with the memory map given to us in the i.MX 8M Plus reference manual. According to the manual, DDR RAM spans from address `0x4000_0000` to `0xFFFF_FFFF` (3 GB), and the regions in the reserved memory all fall within that range, confirming that they are all located in DRAM.

- **m7_reserved** (`0x8000_0000 – 0x80FF_FFFF`, 16 MB): holds the M7's code and data when its firmware is linked to run from DDR instead of TCM.
- **vdev0vring0** (`0x5500_0000 – 0x5500_7FFF`, 32 KB): the first RPMsg vring, a ring buffer that carries messages from the M7 to Linux.
- **vdev0vring1** (`0x5500_8000 – 0x5500_FFFF`, 32 KB): the second RPMsg vring, which carries messages from Linux to the M7.
- **rsc_table** (`0x550F_F000 – 0x550F_FFFF`, 4 KB): the resource table, which the M7 firmware uses to tell Linux what it needs, such as where the vrings are.
- **vdevbuffer** (`0x5540_0000 – 0x554F_FFFF`, 1 MB): a shared DMA pool that holds the actual RPMsg message buffers that the vrings point to.

Now let's talk about the `imx8mp-cm7` node, which tells Linux how to find the M7 core. On its own, Linux doesn't know the M7 core exists or how to talk to it, which is why this node is needed. Once Linux knows the core exists, it binds the remoteproc driver to it, which can then load firmware onto the core and start it.

- **compatible** (`"fsl,imx8mn-cm7"`): tells Linux which driver to bind to the node, in this case the i.MX remoteproc driver (`imx_rproc`). The i.MX 8M Plus reuses the i.MX 8M Nano compatible string because the M7 is controlled the same way on both chips.
- **rsc-da** (`0x55000000`): the address of the resource table region in the M7's address space, which the driver uses to find the resource table.
- **clocks** and **clock-names**: the clocks the M7 needs. `core` is the M7's own clock, and `audio` is the audio PLL clock, which Linux keeps enabled for the M7.
- **mboxes** and **mbox-names**: the Messaging Unit (MU) channels used to notify the other core when there is a new message. `tx` is for sending, `rx` is for receiving, and `rxdb` is a doorbell channel for receiving simple notifications.
- **memory-region**: links the node to the reserved memory regions above (`vdevbuffer`, `vdev0vring0`, `vdev0vring1`, and `rsc_table`), so the driver knows which memory to use for RPMsg.
- **fsl,startup-delay-ms** (`500`): how long Linux waits after starting the M7 before trying to talk to it, giving the firmware time to initialise.
- **status** (`"okay"`): enables the node. Without this, Linux would ignore it.


After setting up we most tell uBoot that we want our new device tree to get loaded with the Kernel we the fdtfile argument in uboot is what tells uboot what flattened device tree or device tree blob to use. We can ad

#### Adding it to the Yocto Layer
Now that we have our device tree, we need to add it to our Yocto layer so it gets built with the kernel. Since `imx8mp-causality.dts` is a new file rather than a change to an existing one, we don't need a patch. Instead, we can place the file in our layer and have the `linux-imx` recipe copy it into the kernel source before it builds. The layout in `meta-causality-imx` looks like this:

{% highlight text %}
recipes-kernel/
└── linux/
    ├── files/
    │   └── imx8mp-causality.dts
    └── linux-imx_%.bbappend
{% endhighlight %}

Create a recipes-kernel/linux/linux-imx_%.bbappend
{% highlight bash linenos %}
FILESEXTRAPATHS:prepend := "${THISDIR}/files:"

SRC_URI:append:imx8mpfrdm = " file://imx8mp-causality.dts"

# Copy our device tree into the kernel source next to the other i.MX device trees
do_configure:append:imx8mpfrdm() {
    cp ${WORKDIR}/imx8mp-causality.dts ${S}/arch/arm64/boot/dts/freescale/
}
{% endhighlight %}

- **`FILESEXTRAPATHS:prepend`**: lets BitBake find files in the `files/` directory next to the `.bbappend`.
- **`SRC_URI:append:imx8mpfrdm`**: adds our `.dts` to the recipe's sources, but only when building for the FRDM-i.MX8MP machine.
- **`do_configure:append`**: copies the `.dts` into `arch/arm64/boot/dts/freescale/`, the same directory as `imx8mp-frdm.dts`, so our `#include "imx8mp-frdm.dts"` resolves.

Copying the file in isn't enough on its own, because the kernel recipe only builds the device trees listed in `KERNEL_DEVICETREE`. We add ours to that list in `conf/local.conf`:

{% highlight bash linenos %}
KERNEL_DEVICETREE:append:imx8mpfrdm = " freescale/imx8mp-causality.dtb"
{% endhighlight %}

This needs to go in a configuration file rather than the kernel `.bbappend`, because the image recipe also reads `KERNEL_DEVICETREE` to decide which device trees to copy into the boot partition. If it were only set in the kernel recipe, the `.dtb` would be built but never end up on the SD card, and U-Boot would not be able to find it.

After setting up we most tell uBoot that we want our new device tree to get loaded with the Kernel we the fdtfile argument in uboot is what tells uboot what flattened device tree or device tree blob to use. We can append the uboot recipe and override the fdtfile argument with our own device tree blob like this:

Create a recipes-bsp/uboot/files/fdtfile.cfg file with the following content.
{% highlight ini linenos %}
CONFIG_DEFAULT_FDT_FILE="imx8mp-causality.dtb"
{% endhighlight %}

Create a recipes-bsp/uboot/uboot-imx_%.bbappend
{% highlight bash linenos %}
FILESEXTRAPATHS:prepend := "${THISDIR}/files:"

# Boot our DTB by default
SRC_URI:append:imx8mpfrdm = " file://fdtfile.cfg"
{% endhighlight %}


## Testing with a Hello World M7 Image
To test that everything works, I built a simple hello world program for the M7 using NXP's MCUXpresso SDK. The SDK comes with a `hello_world` demo for the i.MX 8M Plus that prints a message over the M7's debug UART, which is exactly what we need to prove the core boots. I won't go through setting up the SDK here, since NXP already has a good [getting started guide](https://mcuxpresso.nxp.com/mcuxsdk/latest/html/gsd/repo.html) that walks you through it. I built the demo to run from TCM, which gave me `imx8mp_m7_TCM_hello_world.elf`. I then copied the `.elf` over to the board's `/lib/firmware` directory using `scp`:

{% highlight bash linenos %}
$ scp imx8mp_m7_TCM_hello_world.elf root@<board-ip>:/lib/firmware/
{% endhighlight %}

The steps below follow NXP's application note [AN5317](https://www.nxp.com/docs/en/application-note/AN5317.pdf), which covers loading code onto the Cortex-M from U-Boot and Linux.

**1. Prepare the M7 in U-Boot**

Power up the board, stop in U-Boot, and run the following commands:
{% highlight bash linenos %}
u-boot=> run prepare_mcore
u-boot=> boot
{% endhighlight %}

**2. Check that remoteproc is enabled**

Once Linux has booted, remoteproc exposes the M7 to userspace through sysfs:
{% highlight bash linenos %}
$ ls /sys/class/remoteproc/remoteproc0/
consumers  device    name   recovery  subsystem  uevent
coredump   firmware  power  state     suppliers
{% endhighlight %}

If `/sys/class/remoteproc/` is empty, the remoteproc framework isn't enabled, which usually means the `imx8mp-cm7` node isn't in the device tree that was booted. This is a good way to confirm our new device tree is actually being used.

**3. Point remoteproc to the firmware**

By default, remoteproc looks for firmware in `/lib/firmware`, which is why I copied the `.elf` there. All that's left is to tell remoteproc the name of the firmware file:
{% highlight bash linenos %}
$ echo -n imx8mp_m7_TCM_hello_world.elf > /sys/class/remoteproc/remoteproc0/firmware
{% endhighlight %}

**4. Check the state of the M7**

Before starting the M7 with new firmware, make sure it isn't already running. If it is, it needs to be stopped first.
{% highlight bash linenos %}
$ cat /sys/class/remoteproc/remoteproc0/state
offline
{% endhighlight %}

**5. Start the M7**

{% highlight bash linenos %}
$ echo start > /sys/class/remoteproc/remoteproc0/state
$ cat /sys/class/remoteproc/remoteproc0/state
running
{% endhighlight %}

The hello world message should now appear on the M7's debug UART. This is UART4, which is why we disabled it on the Linux side in our device tree.

**6. Stop the M7**

{% highlight bash linenos %}
$ echo stop > /sys/class/remoteproc/remoteproc0/state
$ cat /sys/class/remoteproc/remoteproc0/state
offline
{% endhighlight %}


## Conclusion

In this post, we added Cortex-M7 support to the FRDM-i.MX8MP BSP in our own Yocto layer. We created a device tree that reserves memory for the M7 and RPMsg and describes the M7 to Linux, added it to the kernel build, and told U-Boot to load it. With a simple hello world `.elf` from the MCUXpresso SDK, we then used remoteproc to start and stop the M7 from Linux, confirming that the BSP changes work.

With the M7 up and running, the foundation for smartsight's heterogeneous design is in place. Next, I will start building the FreeRTOS firmware that will control the pan/tilt servos and get the Cortex-A53 cores and the M7 talking to each other over RPMsg.
