---
layout: post
title: Creating a new Yocto Meta Layer
date: 2026-2-25 16:40:16
description: Showcasing how to create a new Yocto Layer and a new recipe
tags: Embedded-Linux
categories: Yocto
thumbnail: assets/img/blogs/yocto-project-logo.webp
---

## Introduction

This is the second post in my Yocto blog series. In this post we will go over how to create your own meta layer and how to add a custom application to your distro through the use of recipes. First we will go over what is a meta layer and why you should always create your own layer rather than modifying existing upstream layers.

#### What is a meta-layer

In Yocto a a meta-layer is a directory that contains metadata used by the build system to generate a Linux image. It is used to tell Bitbake how to build your own custom Linux distro, a meta-layer is comprised of the following :

- **Configuration files (.conf)** : Used to define global variables and layer dependencies.
- **Recipes(.bb)** : Instructions on how to fetch, configure, compile, and install a specific software package.
- **Append files(.bbappend)** : Used to extend or modify an existing recipe from another layer without modifying the original file.

#### Why is it important to have your own layers

Yocto uses a modular, layered architecture: each layer is stacked on top of others, reusing and extending the functionality provided by the layers below it. By creating your own layer, you can reuse and extend the functionality provided by the layers you depend on, without ever modifying them directly.

Creating your own layer also gives you independence, because it lets you customize your OS without “breaking” the official code from the Yocto Project or your hardware vendor. If you edit their layers directly, you can’t easily pull in updates or security fixes when a new Yocto release (for example, moving from Scarthgap to the next version) comes out. A custom layer keeps all your changes in a separate “bucket” that survives upgrades.


## How to create your layer

