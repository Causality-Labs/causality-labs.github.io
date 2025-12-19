---
layout: post
title: Getting started with Yocto (Poky and First Image)
date: 2025-12-17 16:40:16
description: Documenting using yocto in my Personal Life
tags: "Embedded-Linux"
---

## Introduction

This journal entry marks the begining of my deep dive into the Yocto Project, I have had the oppurtunity to 
work with Yocto in my Career however I would say my expirience with it have been surface level as I mainly had to
maintanace work which had me editing or make a few small recipes here and there. I want to get into roots of Yocto as I feel being 
skilled and having a deep understanding of Yocto will make me a strong embedded linux engineer as I will be able to :

- Creating new custom Linux distributions
- Customize kernels, bootloaders, and root filesystems in a structured and scalable way
- Support long-term maintenance, updates, and product lifecycle management

Feel free to follow me along on this journey and we can both learn a thing or two, the board of choice for this jouney will be the Beagle Bone Black as it is a well documented and well supported board. This serieas was also heavily inspired by Bootlin's Yocto training program which you can find here : 

Ensure you have the following program on your machine as they are needed when working with Yocto:
{% highlight bash linenos %}
$ sudo apt install gawk wget git diffstat unzip texinfo gcc build-essential \
chrpath socat cpio python3 python3-pip python3-pexpect xz-utils debianutils \
iputils-ping python3-git python3-jinja2 python3-subunit zstd liblz4-tool file \
locales libacl1
{% endhighlight %}
#### Poky

Poky is the reference distro provided by the Yocto Project, bundling BitBake, OpenEmbedded metadata, and example configurations so you can build a working Linux image before layering on your own board- or product-specific customizations. 

To build images for a BeagleBone Black, we need:
- The Poky reference system, containing all common recipes and tools.
- The meta-ti-bsp layer, a set of Texas Instruments specific recipes.

To get Poky on your machine, run the following commands:

{% highlight bash linenos %}
$ git clone https://git.yoctoproject.org/git/poky
$ cd $HOME/yocto-labs/poky
$ git checkout -b scarthgap-5.0.4
{% endhighlight %}

At this time, Scarthgap is the LTS release, and we will focus on it. Some directories of note in the Poky repo:
- **bitbake/**: Holds all scripts used by the BitBake command. Usually matches the stable release of the BitBake project.
- **meta/**: Contains the OpenEmbedded-Core metadata.
- **meta-skeleton/**: Contains template recipes for BSP and kernel development.
- **meta-poky/**: Holds the configuration for the Poky reference distribution.
- **meta-yocto-bsp/**: Configuration for the Yocto Project reference hardware board support package.
- **oe-init-build-env**:  Script to set up the OpenEmbedded build environment. It will create the build directory.

#### Additional Layers

In the same directory where Poky is located, add the following layers for our build:

{% highlight bash linenos %}
# Pull the meta-arm repo as we will be using the meta-arm-toolchain
# for our build.
$ git clone https://git.yoctoproject.org/git/meta-arm
$ cd meta-arm
$ git checkout -b yocto-5.0.1 

$ git clone https://git.yoctoproject.org/git/meta-ti
$ cd meta-ti
$ git checkout -b scarthgap-labs 10.01.03

# Bootlin adds these patches to the meta-ti layer. I'm not yet sure if the build is successful without these patches.
# git am $HOME/yocto-labs/bootlin-lab-data/0001-Don-t-use-a-custom-deployment-directory.patch \
# $HOME/yocto-labs/bootlin-lab-data/0002-Modify-linux-bb.org-defconfig.patch
{% endhighlight %}

#### Setting up your build environment

Before you get started, enable BitBake by entering the Poky directory and running:
{% highlight bash linenos %}
$ source oe-init-build-env
{% endhighlight %}

Once you run this command, a build directory will be created with two important files:
- build/conf/bblayers.conf
- build/local.conf

For our build, add absolute paths to the additional meta layers required for our image in `build/conf/bblayers.conf` (it already includes the Poky layers):
- meta-arm
- meta-ti-bsp

Choose `beaglebone-yocto` as the target machine in `build/conf/local.conf`:
```
MACHINE ?= "beaglebone-yocto"
```

To save disk space, add this to `local.conf`:
```
INHERIT += "rm_work"
```

Then build a minimal image:
{% highlight bash linenos %}
$ bitbake core-image-minimal
{% endhighlight %}

After the build completes, key directories in the build tree include:
- downloads/: Source tarballs fetched for recipes.
- sstate-cache/: Shared build artifacts reused across builds to speed up compilation.
- tmp/: Main output directory for all build artifacts.
- tmp/work/: Per-package work dirs (by architecture) with unpacked sources, build outputs, and logs.
- tmp/sysroots/: Headers and libraries used to compile for the target and for native tools on the host.
- tmp/deploy/: Final artifacts produced by the build.
- tmp/deploy/images/: Complete images generated by Yocto; use these to flash the target.

The build will take a while. Once it finishes, navigate to this directory:
{% highlight bash linenos %}
$ cd $PROJ_DIR/poky/build/tmp/deploy/images/beaglebone-yocto
{% endhighlight %}

There should be a file that ends with `.wic`; this is your image.
Connect an SD card to your build machine, then either use balenaEtcher or run the following command:
{% highlight bash linenos %}
# /dev/sdd is how my sd card showed up on my device, be sure to figure
# out the name of the sd card that show up on your station to avoid overwriting crucial information.

$ sudo dd if=core-image-minimal-beaglebone-yocto.rootfs-20251218040257.wic \
of=/dev/sdd bs=4M status=progress conv=fdatasync
{% endhighlight %}

Insert the SD card into the BeagleBone Black, connect a serial debugger, and power it up. You should see the device boot. When prompted to log in, sign in as `root`.

You have successfully built an image using Yocto!!
