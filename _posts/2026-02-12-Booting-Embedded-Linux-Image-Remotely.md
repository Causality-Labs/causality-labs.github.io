---
layout: post
title: Booting an Image from a remote source
date: 2025-12-17 16:40:16
description: Documenting using yocto in my Personal Life
tags: Embedded-Linux
categories: Yocto
thumbnail: assets/img/blogs/yocto-project-logo.webp
---

## Introduction

This is the second post in my Yocto blog series. I have since switched single-board computers (SBCs); I was previously using the BeagleBone Black. However, I have moved to the FRDM i.MX91 board instead because the Ethernet port on the BeagleBone Black is faulty in the Yocto Scarthgap release. Instructions for building a Yocto image for the i.MX91 board can be found [here](https://www.nxp.com/document/guide/getting-started-with-frdm-imx91-development-board:GS-FRDM-IMX91?section=build-and-run).

This post explains how to set up booting Linux from a remote source. This approach avoids the need to flash an SD card every time you modify your Yocto image.

## Network File System (NFS)

The first method we will go over is Network File System booting. It's useful to first understand what a Network File System is.

A Network File System (NFS) is a protocol that allows a user on a client computer to access and interact with files over a network as if they were stored on their own local hard drive. In our specific application, the target hardware (i.MX91) will mount its root filesystem from a remote host over the network, rather than from local storage like an SD card or eMMC.

This is useful to the Yocto workflow as it allows us to:

- **Rapid Iteration**: In Yocto, the root filesystem can be hundreds of megabytes. Flashing this to an SD card every time you change a configuration or add a package takes minutes. With NFS, as soon as bitbake finishes building, the changes are "live" on the next reboot.

- **Storage Limitations**: Development images often include debug tools and headers that make them too large for small SD cards or internal flash. NFS allows you to use your PC's multi-terabyte drive as the board's storage.

- **Wear Leveling**: You avoid burning out SD cards with constant writes during the development and debugging phase.

- **Ease of Access**: You can modify files on the target directly from your host PC using your favorite editor, and the changes are immediately visible to the running target (and vice versa).


Now we will go over how to set up NFS booting for your Yocto image:

#### Set up the NFS server on the workstation
Make sure you have the nfs-kernel package installed on your system
{% highlight bash linenos %}
$ sudo apt install nfs-kernel-server
{% endhighlight %}

Then create a directory where you wish to store your rootfs
{% highlight bash linenos %}
$ sudo mkdir -m 777 /nfs
{% endhighlight %}

Ensure that the directory above is exported by the NFS server by /etc/exports file
{% highlight bash linenos %}
/nfs *(rw,sync,no_root_squash,subtree_check)
{% endhighlight %}

Finally, make the NFS server use the new configuration
{% highlight bash linenos %}
sudo exportfs -r
{% endhighlight %}

#### Ensure SSH is enabled in your image
To be able to log into your device you must make sure ssh is installed in your image which is a part of the dropbear package. You can do this by making sure you add this to your local.conf
{% highlight bash linenos %}
IMAGE_INSTALL:append = " dropbear"
{% endhighlight %}

After adding this to your local.conf you can now rebuild the image and it will add the dropbear package which gives you access to ssh.

To deploy the root filesystem, untar the compressed image from your Yocto build directory into the NFS server directory:
{% highlight bash linenos %}
$ sudo tar -xvf <path-to-your-build-directory>/tmp/deploy/images/imx91frdm/<name_of_image>.tar.zst -C /nfs
{% endhighlight %}

#### Network Connection
For NFS booting to work, your target device and host workstation must be on the same local network. My current configuration uses a Raspberry Pi 5 as a DHCP server with both the host and the i.MX91 connected via a network switch. While your specific network setup may vary, the critical requirement is that both machines can communicate directly. In this example, I will use `10.10.10.10` as the host's IP address.

#### Booting via NFS
Connect to your board's serial console and power it on. Enter the U-Boot bootloader; we will now modify the boot commands to allow the board to boot using the NFS server on your host machine.
{% highlight bash linenos %}
$ setenv bootargs 'bootargs=console=ttyLP0,115200 root=/dev/nfs nfsroot=10.10.10.10:/nfs,v3,tcp\
rw ip=10.10.10.30::10.10.10.10:255.255.255.0::eth0:off'

$ setenv mmcargs bootargs

$ saveenv
{% endhighlight %}

These commands configure how the Linux kernel starts.
- **setenv bootargs**: This defines the kernel command line parameters.
    - `console=ttyLP0,115200`: Directs the system output to the serial console.
    - `root=/dev/nfs`: Tells the kernel to mount its root filesystem via NFS.
    - `nfsroot=10.10.10.10:/nfs,v3,tcp`: Specifies the host's IP (`10.10.10.10`), the exported directory (`/nfs`), and use of NFS version 3 with TCP.
    - `ip=10.10.10.30...`: Assigns a static IP (`10.10.10.30`) to the board and tells it how to find the host.
- **setenv mmcargs bootargs**: This common U-Boot pattern on i.MX boards ensures our custom parameters are applied during the boot process.
- **saveenv**: Persists these changes to the board's storage so they remain after a reboot.

After this, run the `boot` command. Once the booting process is complete, try to SSH into the device from your host machine:
{% highlight bash linenos %}
ssh root@10.10.10.30
{% endhighlight %}

You should now have SSH access to your device.

## Trivial File Transfer Protocol (TFTP)

Next, we will go over booting by using the Trivial File Transfer Protocol (TFTP).

TFTP is a simplified version of FTP that is commonly used in local networks to transfer files without the overhead of authentication or complex directory management.

In **Embedded Linux development**, TFTP is a cornerstone of the "Remote Boot" workflow. While NFS handles the root filesystem (the files and applications), TFTP is responsible for delivering the **Linux Kernel image** and the **Device Tree Blob (DTB)** to the board.

### Why it is Relevant
- **Minimalist Design**: TFTP has a tiny footprint, making it easy to implement inside a bootloader where space is at a premium.
- **Speed**: Because it runs over UDP with very little overhead, it is extremely fast for transferring the relatively small kernel and DTB files (usually 10-30 MB).
- **Avoids Flash Memory**: You don't have to write the kernel to an SD card or eMMC every time you recompile it. You simply `bitbake` on your PC, and the new kernel is automatically served to the board on the next reboot.
- **Diskless Operation**: Combined with NFS, you can boot a board that has *no local storage* at all, which is common during early hardware bring-up.

### How it is Used
When you power on your board and it enters the U-Boot bootloader:
1. **Network Initialization**: U-Boot initializes the Ethernet hardware and gets an IP address (via DHCP or static assignment).
2. **Request**: U-Boot sends a TFTP request to your host workstation asking for specific files (e.g., `Image` and the `.dtb` file).
3. **Transfer**: The TFTP server on your PC sends these files directly into the board's RAM at specific memory addresses.
4. **Boot**: U-Boot then executes the kernel from that RAM location.

Now we will go over how to set up the TFTP server on your host machine:

