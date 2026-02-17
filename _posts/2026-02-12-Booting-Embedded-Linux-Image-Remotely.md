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

The first method we will go over is Network File System booting. It would be useful first to go over what a Network File System is first.

A network File Systems (NFS) in one sentence is a protocol that allows a user on a client computer to access and interact with files over a network as if they were stored on their own local hard drive. In our specific application the target hardware (i.MX91) will mount its root filesystem from a remote host over the network, rather than from local storage like an SD card or eMMC.

This is useful to the Yocto Workflow as it allows for us to do the following:

- **Rapid Iteration**: In Yocto, the root filesystem can be hundreds of megabytes. Flashing this to an SD card every time you change a configuration or add a package takes minutes. With NFS, as soon as bitbake finishes building, the changes are "live" on the next reboot.

- **Storage Limitations**: Development images often include debug tools and headers that make them too large for small SD cards or internal flash. NFS allows you to use your PC's multi-terabyte drive as the board's storage.

- **Wear Leveling**: You avoid burning out SD cards with constant writes during the development and debugging phase.

- **Ease of Access**: You can modify files on the target directly from your host PC using your favorite editor, and the changes are immediately visible to the running target (and vice versa).


Now we will go over how to set up NFS booting for your Yocto image:

#### Set up the NFS server on the workstation

## Trivial File Transfer File Protocol (TFTP)

