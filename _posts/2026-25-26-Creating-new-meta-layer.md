---
layout: post
title: Creating a new Yocto Meta Layer
date: 2026-2-22 09:40:16
description: Showcasing how to create a new Yocto Layer
tags: Embedded-Linux
categories: Yocto
thumbnail: assets/img/blogs/yocto-project-logo.webp
---

## Introduction

This is the third post in my Yocto blog series. In this post we will go over how to create your own meta layer. First we will go over what is a meta layer and why you should always create your own layer rather than modifying existing upstream layers.

#### What is a meta-layer

In Yocto a a meta-layer is a directory that contains metadata used by the build system to generate a Linux image. It is used to tell Bitbake how to build your own custom Linux distro, a meta-layer is comprised of the following :

- **Configuration files (.conf)** : Used to define global variables and layer dependencies.
- **Recipes(.bb)** : Instructions on how to fetch, configure, compile, and install a specific software package.
- **Append files(.bbappend)** : Used to extend or modify an existing recipe from another layer without modifying the original file.

#### Why is it important to have your own layers

Yocto uses a modular, layered architecture: each layer is stacked on top of others, reusing and extending the functionality provided by the layers below it. By creating your own layer, you can reuse and extend the functionality provided by the layers you depend on, without ever modifying them directly.

Creating your own layer also gives you independence, because it lets you customize your OS without “breaking” the official code from the Yocto Project or your hardware vendor. If you edit their layers directly, you can’t easily pull in updates or security fixes when a new Yocto release (for example, moving from Scarthgap to the next version) comes out. A custom layer keeps all your changes in a separate “bucket” that survives upgrades.


## How to create your layer

Creating a layer is fairly simple, enter you Yocto build enviroment and activate bitbake. If you are using the imx91 frdm board and follwoed the getting started instructions provided by NXP here [here](https://www.nxp.com/document/guide/getting-started-with-frdm-imx91-development-board:GS-FRDM-IMX91?section=build-and-run). So to get my  build enviroment stared I use the following command:

{% highlight bash linenos %}
$ source setup-environment frdm-imx91/
{% endhighlight %}


Then use this command to find which layers are currently included in you image
{% highlight bash linenos %}
$ bitbake-layers show-layers
{% endhighlight %}

For me when I run this command I see the following output:
{% highlight bash linenos %}
layer                 path                                                                    priority
========================================================================================================
core                  /home/ime/Yocto_Scarthgap_NXP/sources/poky/meta                         5
yocto                 /home/ime/Yocto_Scarthgap_NXP/sources/poky/meta-poky                    5
openembedded-layer    /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-oe         5
multimedia-layer      /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-multimedia  5
meta-python           /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-python     5
freescale-layer       /home/ime/Yocto_Scarthgap_NXP/sources/meta-freescale                    5
freescale-3rdparty    /home/ime/Yocto_Scarthgap_NXP/sources/meta-freescale-3rdparty           4
freescale-distro      /home/ime/Yocto_Scarthgap_NXP/sources/meta-freescale-distro             4
fsl-bsp-release       /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx/meta-imx-bsp             8
fsl-sdk-release       /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx/meta-imx-sdk             8
imx-machine-learning  /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx/meta-imx-ml              8
v2x-imx               /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx/meta-imx-v2x             9
imx-demo              /home/ime/Yocto_Scarthgap_NXP/sources/meta-nxp-demo-experience          7
nxp-matter-baseline   /home/ime/Yocto_Scarthgap_NXP/sources/meta-nxp-connectivity/meta-nxp-matter-baseline  7
nxp-openthread        /home/ime/Yocto_Scarthgap_NXP/sources/meta-nxp-connectivity/meta-nxp-openthread  7
meta-arm              /home/ime/Yocto_Scarthgap_NXP/sources/meta-arm/meta-arm                 5
arm-toolchain         /home/ime/Yocto_Scarthgap_NXP/sources/meta-arm/meta-arm-toolchain       5
clang-layer           /home/ime/Yocto_Scarthgap_NXP/sources/meta-clang                        7
gnome-layer           /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-gnome      5
networking-layer      /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-networking  5
filesystems-layer     /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-filesystems  5
qt6-layer             /home/ime/Yocto_Scarthgap_NXP/sources/meta-qt6                          5
parsec-layer          /home/ime/Yocto_Scarthgap_NXP/sources/meta-security/meta-parsec         5
tpm-layer             /home/ime/Yocto_Scarthgap_NXP/sources/meta-security/meta-tpm            6
virtualization-layer  /home/ime/Yocto_Scarthgap_NXP/sources/meta-virtualization               8
imx-frdm-release      /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx-frdm/meta-imx-bsp        8
imx-frdm-sdk-release  /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx-frdm/meta-imx-sdk        8
imx-frdm-demo         /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx-frdm/meta-nxp-demo-experience  7
{% endhighlight %}

Meaning the layer here with the highest priority is v2x-imx, we want our new layer to have the highest priority. The reason for this will be come clear when I explain what layer priority levels mean within Yocto.

#### Explaining Layer Priority

In Yocto, layer priority is simply the rule that decides which layer “wins” if multiple layers provide or modify the same recipe or configuration. Each layer is assigned a numeric priority in its layer.conf, and the layer with the higher number takes precedence. We want our layer to have the highest priority so the changes we make to features provided by other layers take precedence.

From the list above, we want our new layer to have a higher priority than v2x-imx, so we’ll create it with priority 10. Following the meta-<layer-name> naming convention, we’ll call it meta-causality-labs and create it with the following command.
{% highlight bash linenos %}
$ bitbake-layers create-layer -p 10 meta-causality-labs
{% endhighlight %}

Now inspect the new layers list with the `bitbake-layers show-layers` command and you will see your own new Yocto layer
{% highlight bash linenos %}
layer                 path                                                                    priority
========================================================================================================
core                  /home/ime/Yocto_Scarthgap_NXP/sources/poky/meta                         5
yocto                 /home/ime/Yocto_Scarthgap_NXP/sources/poky/meta-poky                    5
openembedded-layer    /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-oe         5
multimedia-layer      /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-multimedia  5
meta-python           /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-python     5
freescale-layer       /home/ime/Yocto_Scarthgap_NXP/sources/meta-freescale                    5
freescale-3rdparty    /home/ime/Yocto_Scarthgap_NXP/sources/meta-freescale-3rdparty           4
freescale-distro      /home/ime/Yocto_Scarthgap_NXP/sources/meta-freescale-distro             4
fsl-bsp-release       /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx/meta-imx-bsp             8
fsl-sdk-release       /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx/meta-imx-sdk             8
imx-machine-learning  /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx/meta-imx-ml              8
v2x-imx               /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx/meta-imx-v2x             9
imx-demo              /home/ime/Yocto_Scarthgap_NXP/sources/meta-nxp-demo-experience          7
nxp-matter-baseline   /home/ime/Yocto_Scarthgap_NXP/sources/meta-nxp-connectivity/meta-nxp-matter-baseline  7
nxp-openthread        /home/ime/Yocto_Scarthgap_NXP/sources/meta-nxp-connectivity/meta-nxp-openthread  7
meta-arm              /home/ime/Yocto_Scarthgap_NXP/sources/meta-arm/meta-arm                 5
arm-toolchain         /home/ime/Yocto_Scarthgap_NXP/sources/meta-arm/meta-arm-toolchain       5
clang-layer           /home/ime/Yocto_Scarthgap_NXP/sources/meta-clang                        7
gnome-layer           /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-gnome      5
networking-layer      /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-networking  5
filesystems-layer     /home/ime/Yocto_Scarthgap_NXP/sources/meta-openembedded/meta-filesystems  5
qt6-layer             /home/ime/Yocto_Scarthgap_NXP/sources/meta-qt6                          5
parsec-layer          /home/ime/Yocto_Scarthgap_NXP/sources/meta-security/meta-parsec         5
tpm-layer             /home/ime/Yocto_Scarthgap_NXP/sources/meta-security/meta-tpm            6
virtualization-layer  /home/ime/Yocto_Scarthgap_NXP/sources/meta-virtualization               8
imx-frdm-release      /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx-frdm/meta-imx-bsp        8
imx-frdm-sdk-release  /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx-frdm/meta-imx-sdk        8
imx-frdm-demo         /home/ime/Yocto_Scarthgap_NXP/sources/meta-imx-frdm/meta-nxp-demo-experience  7
meta-causality-labs   /home/ime/Yocto_Scarthgap_NXP/frdm-imx91/meta-causality-labs            10
{% endhighlight %}

Now inspecting the new layer we created, we can briefly go over what each of these files does:

{% highlight bash linenos %}
.
├── conf
│   └── layer.conf
├── COPYING.MIT
├── README
└── recipes-example
    └── example
        └── example_0.1.bb
{% endhighlight %}

- **conf/layer.conf** – The main configuration file for the layer. It tells BitBake where to find recipes in this layer, what the layer’s priority is, and which other layers it depends on.
- **COPYING.MIT** – A copy of the MIT license, added by default to describe the license under which the layer’s metadata is distributed.
- **README** – A placeholder for documentation about the layer: what it provides, how to enable it, and any special notes or requirements.
- **recipes-example/example/example_0.1.bb** – A simple example recipe included as a template. It demonstrates the basic structure of a BitBake recipe and is meant to be replaced or used as a reference when writing your own recipes.

Now that we have our own custom layers we can now add applications to our image using recipes, next post we will go over how to add different applications to our custom image through the use of recipes.
