---
layout: post
title: Adding BME280 Kernel Support in Yocto
date: 2026-03-15 09:40:16
description: Adding device tree and kernel driver support for the BME280 sensor using Yocto
tags: Embedded-Linux
categories: Yocto
thumbnail: assets/img/blogs/yocto-project-logo.webp
---

## Introduction

This is the fourth post in my Yocto blog series. In this post we will go over how to add kernel support for the BME280 sensor for our [envsensord](https://causality-labs.github.io/projects/Env_Sensor_Daemon/) application. envsensord is the Environmental Sensor Daemon, a multi-threaded server application that provides network-accessible environmental data from a BME280 sensor.

Here is an overview of the steps we will follow:

1. Connect the BME280 sensor to the i.MX91 FRDM board.
2. Use devtool to modify the device tree.
3. Enable the BME280 sensor driver in kernel menuconfig.
4. Create a bbappend file for our changed device tree and the new kernel config.


## Connecting the BME280 sensor to our board
To verify the BME280 sensor connection, we will use the `i2cdetect` utility from the `i2c-tools` package. To include it in the image, add the following to your `local.conf`:
{% highlight bash linenos %}
IMAGE_INSTALL:append = " i2c-tools"
{% endhighlight %}

Now rebuild your image once more and copy your new rootfs into the NFS directory and the new kernel and device tree into the TFTP server as we discussed in our previous post.

Connect the BME280 sensor to your board, then run `i2cdetect -l` to list all available I2C buses:
{% highlight bash linenos %}
$ i2cdetect -l
i2c-0   i2c             44340000.i2c                            I2C adapter
i2c-1   i2c             44350000.i2c                            I2C adapter
i2c-2   i2c             42530000.i2c                            I2C adapter
{% endhighlight %}

In this case, three I2C buses are available. Once you have identified the correct bus, run `i2cdetect -y <bus_number>` to scan it for connected devices. Here we scan bus `0` and can see the BME280 appearing at address `0x76`:
{% highlight bash linenos %}
$ i2cdetect -y 0
     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
00:                         -- -- -- -- -- -- -- -- 
10: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- 
20: UU -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- 
30: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- 
40: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- 
50: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- 
60: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- 
70: -- -- -- -- -- -- 76 --     
{% endhighlight %}

Next we will use Devtool to modify the device tree for our board.

## Devtool

`devtool` is a Yocto utility that lets you check out a recipe's source, make changes, and integrate them back into your layer without manually managing patches, making it ideal for iterating on the kernel or device tree. For more information on Devtool, refer to the official [Yocto documentation](https://docs.yoctoproject.org/ref-manual/devtool-reference.html).

## Device Trees

A Device Tree (DT) is a data structure that describes the hardware topology of a system to the Linux kernel. On embedded platforms like the i.MX91, peripherals are hardwired to specific addresses and buses that the kernel cannot auto-detect. The Device Tree Source (`.dts`) file tells the kernel what hardware is present, how it is connected, and which driver to bind to each node. To add support for the BME280 sensor, we need to add a node to the I2C bus in the board's device tree. For more information on device tree syntax, refer to this [NXP application note](https://www.nxp.com/docs/en/application-note/AN5125.pdf).

First, use `devtool modify` to check out the `linux-imx` kernel source into a workspace where you can make edits:
{% highlight bash linenos %}
$ devtool modify linux-imx
{% endhighlight %}

This will clone the kernel source and set up a working directory under `<build_dir>/workspace/sources/linux-imx`. Navigate to the board's device tree file (typically found under `arch/arm64/boot/dts/freescale/`) and add the BME280 node to the `lpi2c1` bus. The node declares the sensor's compatible string (`bosch,bme280`) and its I2C address (`0x76`), which is what the kernel uses to bind the correct driver:

{% highlight c linenos %}
&lpi2c1 {
	#address-cells = <1>;
	#size-cells = <0>;
	clock-frequency = <400000>;
	pinctrl-names = "default", "sleep";
	pinctrl-0 = <&pinctrl_lpi2c1>;
	pinctrl-1 = <&pinctrl_lpi2c1>;
	status = "okay";

	pcal6408: gpio@20 {
		compatible = "nxp,pcal9554b";
		reg = <0x20>;
		gpio-controller;
		#gpio-cells = <2>;
		vcc-supply = <&reg_usdhc3_vmmc>;
		status = "okay";
	};

	bme280: bme280@76 {
		compatible	 = "bosch,bme280";
		reg = <0x76>;
		status = "okay";
	};
};
{% endhighlight %}

The BME280 node is defined under the `lpi2c1` bus at address `0x76`, which matches the physical I2C address of the sensor on the board. Each property in the node serves a specific purpose:

- **`compatible`**: Tells the kernel which driver to bind to this device. The value `bosch,bme280` maps to the BME280 driver in the kernel's Industrial I/O (IIO) subsystem.
- **`reg`**: Sets the I2C address of the device (`0x76`). This must match the hardware address detected earlier with `i2cdetect`.
- **`status`**: Setting this to `"okay"` enables the node, instructing the kernel to probe and bind the driver at boot.

Once the device tree has been updated, build the kernel to compile the changes:
{% highlight bash linenos %}
$ devtool build linux-imx
{% endhighlight %}

Once the build completes successfully, stage and commit your changes with `git add` and `git commit`. Then use `devtool finish` to generate a patch and integrate it back into your custom layer (`meta-causality-labs`), keeping the modification tracked and reproducible in future builds:
{% highlight bash linenos %}
$ devtool finish linux-imx meta-causality-labs
{% endhighlight %}

After the command `devtool finish` is done, navigate to your custom Yocto layer and you will now see a new directory:
{% highlight bash linenos %}
$ tree recipes-kernel
recipes-kernel
└── linux
    ├── linux-imx
    │   ├── 0001-Added-bme280-to-the-imx91-dts.patch
    └── linux-imx_%.bbappend
{% endhighlight %}
`devtool finish` has automatically created two files in the `recipes-kernel/linux/` directory of your layer:

- **`0001-Added-bme280-to-the-imx91-dts.patch`**: A Git-formatted patch file containing exactly the device tree changes you made. Yocto applies this patch to the kernel source during every future build, making the change reproducible without requiring manual edits to the source tree.
- **`linux-imx_%.bbappend`**: A BitBake append file that extends the existing `linux-imx` recipe to include the patch above. The `%` wildcard means it applies to any version of the recipe, so the patch remains compatible across kernel version bumps.

If you built and booted this image now, you would notice that the BME280 sensor driver is not loaded. Adding a device tree node alone is not enough — the kernel must also have the driver compiled in. We need to enable it in the kernel configuration.

## Kernel Config

A `defconfig` (default configuration) file is a minimal kernel configuration that specifies which features and drivers should be compiled into the kernel or built as loadable modules. When building a kernel with Yocto, the `defconfig` for your target board serves as the starting point. During the build, it is expanded into a full `.config` file that captures every kernel option. To enable the BME280 driver, we need to add its configuration symbol to this file so the kernel includes the IIO driver and loads it when the matching device tree node is found at boot.

We do this by creating a kernel configuration fragment. First, run `kernel_configme` to generate the base `.config` file from the board's `defconfig`:
{% highlight bash linenos %}
$ bitbake linux-imx -c kernel_configme
{% endhighlight %}

Now we can modify the kernel configuration using `menuconfig`, a text-based graphical interface that lets you browse and toggle kernel options without manually editing the `.config` file. Open it with:
{% highlight bash linenos %}
$ bitbake linux-imx -c menuconfig
{% endhighlight %}

Search for `BME280` and set it to built-in (`*`). You can find the BME280 sensor option by navigating through the following path in menuconfig:

`Device Drivers` → `Industrial I/O support` → `Pressure sensors` → `Bosch Sensortec BME280`

Set it to built-in by pressing `y`.

Once you have saved your changes, run `diffconfig` to extract only the options you changed relative to the base configuration. This produces a minimal `.cfg` fragment file that can be tracked in your layer:
{% highlight bash linenos %}
$ bitbake linux-imx -c diffconfig
{% endhighlight %}

The output file will be called `fragment.cfg` and it will be located in the kernel's work directory. Copy it into your custom layer alongside the existing kernel recipe files:
{% highlight bash linenos %}
$ cp <build_dir>/tmp/work/<machine>-<vendor>-linux/<kernel_recipe>/<version>/fragment.cfg <your_layer>/recipes-kernel/linux/linux-imx/
{% endhighlight %}

Here is what the fragment should look like:
{% highlight bash linenos %}
CONFIG_BMP280=y
CONFIG_BMP280_I2C=y
CONFIG_BMP280_SPI=y
{% endhighlight %}
Note that the config symbols use `BMP280` rather than `BME280` — this is the driver name used in the kernel, so do not worry about the difference. We can now rename `fragment.cfg` to something more descriptive like `bmp280.cfg`.

Now we modify the `linux-imx_%.bbappend` file to include the kernel configuration fragment and the device tree patch.
{% highlight bash linenos %}
FILESEXTRAPATHS:prepend := "${THISDIR}/${PN}:"

SRC_URI += "file://0001-Added-bme280-to-the-imx91-dts.patch"
SRC_URI += "file://bmp.cfg"

DELTA_KERNEL_DEFCONFIG = "bmp.cfg"
{% endhighlight %}

Here is what each line does:

- **`FILESEXTRAPATHS:prepend`**: Extends the file search path so BitBake can find files in the `linux-imx/` directory next to this `.bbappend` file. `${THISDIR}` is the directory of the append file and `${PN}` is the package name (`linux-imx`).
- **`SRC_URI += "file://0001-Added-bme280-to-the-imx91-dts.patch"`**: Adds our device tree patch to the build. BitBake will apply it to the kernel source automatically before compiling.
- **`SRC_URI += "file://bmp.cfg"`**: Adds the kernel configuration fragment to the build sources.
- **`DELTA_KERNEL_DEFCONFIG`**: Tells the NXP kernel recipe to merge `bmp.cfg` on top of the base `defconfig`, enabling the BME280 driver options without modifying the original defconfig. Note that this variable is specific to the NXP `linux-imx` recipe and is not part of the standard Yocto kernel infrastructure.

