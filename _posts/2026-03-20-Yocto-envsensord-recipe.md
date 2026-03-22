---
layout: post
title: Building envsensord in Yocto P6
date: 2026-03-20 09:40:16
description: Writing a Yocto recipe to build and deploy envsensord as a Daemon
tags: Embedded-Linux
categories: Yocto
thumbnail: assets/img/blogs/yocto-project-logo.webp
---

## Introduction

This is the sixth post in my Yocto blog series. In this post we will go over how to build [envsensord](https://causality-labs.github.io/projects/Env_Sensor_Daemon/) in Yocto as a recipe. We will also add it as a SysVinit init script, so the program will be able to start up on boot.

Here is an overview of the steps we will follow:

1. Write a BitBake recipe to fetch and build envsensord.
2. Write an init script for envsensord.
3. Add the recipe to the image.
4. Test envsensord on the board.

## Bitbake Recipes

A recipe is a plain-text file with a .bb extension (e.g., envsensord_1.0.bb). It tells BitBake everything it needs to know about one package: where to get the source, how to build it, what it depends on, and what to put in the final image. The filename itself is meaningful; by convention it encodes the package name and version.

## SysVinit

SysVinit is the traditional Unix init system. When the Linux kernel finishes booting, it launches `/sbin/init` (PID 1), which reads `/etc/inittab` to determine the default runlevel and then executes the init scripts in `/etc/init.d/` in the order defined by the symlinks in `/etc/rc<runlevel>.d/`.

Each service is managed by a shell script in `/etc/init.d/` that accepts standard arguments:

- `start` — start the daemon
- `stop` — stop the daemon
- `restart` — stop then start
- `status` — report whether the daemon is running

The symlinks in `/etc/rc<runlevel>.d/` are named with a prefix of `S` (start) or `K` (kill) followed by a two-digit priority number that controls the order in which scripts run. The `update-rc.d` tool manages these symlinks automatically.



## Creating a recipe

To create a recipe, navigate your meta layer, and create a directory called `recipes-<category>`, then in that directory create another one called `<package-name>`. In our case we will create a directory called `recipes-services/envsensord`.
{% highlight bash linenos %}
$ mkdir -p recipes-services/envsensord
{% endhighlight %}

Now create a file called envsensord_0.1.bb in the envsensord directory; this will be our recipe file. Now we can create our recipe which should look like this:
{% highlight bash linenos %}
SUMMARY = "Environment sensor daemon"
DESCRIPTION = "Daemon and CLI for reading and exposing environmental sensor data (temperature, humidity, pressure)."

LICENSE = "MIT"
LIC_FILES_CHKSUM = "file://${COMMON_LICENSE_DIR}/MIT;md5=0835ade698e0bcf8506ecda2f7b4f302"

PR = "r0"

inherit update-rc.d

FILESEXTRAPATHS:prepend := "${THISDIR}/${PN}:"

INITSCRIPT_NAME = "envsensord"
INITSCRIPT_PARAMS = "defaults 80 20"

FILES:${PN} += "${bindir} ${sysconfdir}/init.d"

SRC_URI = "git://github.com/Causality-Labs/envsensord.git;protocol=https;branch=main \
           file://envsensord.sh \
"
SRCREV = "13187844f4b1c80a94bea26a8f94ed1f0152c4bb"
S = "${WORKDIR}/git"

do_install() {
	install -d ${D}${bindir}
	install -m 0755 bin/envsensord ${D}${bindir}/envsensord
	install -m 0755 bin/envsensor-cli ${D}${bindir}/envsensor-cli

	install -d ${D}${sysconfdir}/init.d
	install -m 0755 ${WORKDIR}/envsensord.sh ${D}${sysconfdir}/init.d/envsensord
}
{% endhighlight %}

## How the recipe works

Let's walk through each part of the recipe and explain what it does.

**Metadata**

`SUMMARY` and `DESCRIPTION` are human-readable strings that describe the package. `LICENSE` identifies the software license and `LIC_FILES_CHKSUM` provides a checksum of the license file so BitBake can verify it hasn't changed. `PR` is the package revision; incrementing it forces a rebuild without changing the version number.

**Inheriting update-rc.d support**

{% highlight bash linenos %}
inherit update-rc.d
{% endhighlight %}

This pulls in the `update-rc.d` BitBake class, which handles the creation of the runlevel symlinks in `/etc/rc<N>.d/` during image assembly. Without this, the `INITSCRIPT_NAME` and `INITSCRIPT_PARAMS` variables would have no effect.

**Extra file paths**

{% highlight bash linenos %}
FILESEXTRAPATHS:prepend := "${THISDIR}/${PN}:"
{% endhighlight %}

This tells BitBake to look for local files (like `envsensord.service`) in a subdirectory named after the package (`envsensord/`) that lives next to the recipe file itself.

**Init script configuration**

{% highlight bash linenos %}
INITSCRIPT_NAME = "envsensord"
INITSCRIPT_PARAMS = "defaults 80 20"
{% endhighlight %}

`INITSCRIPT_NAME` is the name of the script that will be installed in `/etc/init.d/`. `INITSCRIPT_PARAMS` is passed directly to `update-rc.d` when the package is installed. `defaults 80 20` means the script will be started with priority 80 (so it starts after most other services) and stopped with priority 20 (so it stops early during shutdown).

**Packaging the installed files**

{% highlight bash linenos %}
FILES:${PN} += "${bindir} ${sysconfdir}/init.d"
{% endhighlight %}

This appends the binary directory and the init script directory to the list of paths that get packaged into the final `.ipk`/`.rpm` package. BitBake would otherwise not know to include them.

**Fetching the source**

{% highlight bash linenos %}
SRC_URI = "git://github.com/Causality-Labs/envsensord.git;protocol=https;branch=main \
           file://envsensord.sh \
"
SRCREV = "13187844f4b1c80a94bea26a8f94ed1f0152c4bb"
S = "${WORKDIR}/git"
{% endhighlight %}

`SRC_URI` lists two sources: the upstream Git repository (fetched over HTTPS from the `main` branch) and a local `envsensord.sh` init script bundled with the recipe. `SRCREV` pins the exact commit that will be checked out, making the build fully reproducible. `S` tells BitBake where the unpacked source tree lives — for Git fetches this is always `${WORKDIR}/git`.

**Installing the files**

{% highlight bash linenos %}
do_install() {
    install -d ${D}${bindir}
    install -m 0755 bin/envsensord ${D}${bindir}/envsensord
    install -m 0755 bin/envsensor-cli ${D}${bindir}/envsensor-cli

    install -d ${D}${sysconfdir}/init.d
    install -m 0755 ${WORKDIR}/envsensord.sh ${D}${sysconfdir}/init.d/envsensord
}
{% endhighlight %}

`do_install` copies the build outputs into the staging directory `${D}`, which mirrors the root filesystem layout of the target image. `install -d` creates the destination directory, `install -m 0755` copies both the binaries and the init script as executables with the correct permissions. The `update-rc.d` class then creates the appropriate runlevel symlinks pointing at `/etc/init.d/envsensord`.


## Init script

{% highlight bash linenos %}
#!/bin/sh
### BEGIN INIT INFO
# Provides:          envsensord
# Required-Start:    $network
# Required-Stop:     $network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Environment Sensor Daemon
### END INIT INFO

DAEMON=/usr/bin/envsensord
NAME=envsensord
PIDFILE=/var/run/$NAME.pid

case "$1" in
    start)
        echo "Starting $NAME"
        start-stop-daemon --start --background --make-pidfile \
            --pidfile $PIDFILE --exec $DAEMON
        ;;
    stop)
        echo "Stopping $NAME"
        start-stop-daemon --stop --pidfile $PIDFILE
        rm -f $PIDFILE
        ;;
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
    status)
        if [ -f $PIDFILE ] && kill -0 $(cat $PIDFILE) 2>/dev/null; then
            echo "$NAME is running (PID $(cat $PIDFILE))"
        else
            echo "$NAME is not running"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac

exit 0

{% endhighlight %}

The init script follows the LSB (Linux Standard Base) convention. The `### BEGIN INIT INFO` block at the top is a structured header that tools like `update-rc.d` and `insserv` parse to determine ordering and dependencies.

**Header fields**

`Provides` names the facility this script provides. `Required-Start` and `Required-Stop` declare dependencies — here `$network` means the script requires the network to be up before starting and for it to still be up before stopping. `Default-Start` lists the runlevels in which the `S` (start) symlinks are created; `Default-Stop` lists those in which `K` (kill) symlinks are created.

**Case statement**

The `start` case uses `start-stop-daemon` to launch `envsensord` in the background, writing a PID file to `/var/run/envsensord.pid`. The `stop` case uses `start-stop-daemon --stop` to send a termination signal and then removes the PID file. The `restart` case simply calls stop then start. The `status` case checks whether the process recorded in the PID file is still alive and exits with a non-zero code if it is not, which is the standard behaviour expected by monitoring tools.

## Building the recipe

With the recipe and service file in place, you can test building the package in isolation before adding it to your image. From your build directory, source the environment and run BitBake targeting just the recipe:
{% highlight bash linenos %}
$ bitbake envsensord
{% endhighlight %}

BitBake will fetch the source from GitHub, compile it, and run `do_install` to stage the files. If the build succeeds you will see a `NOTE: Tasks Summary: Attempted 14 tasks of which 14 didn't need to be rerun, 14 tasks succeeded` style message. If it fails, check the log file printed in the error output — common issues are a missing `DEPENDS` entry for a library the daemon links against, or an incorrect `SRCREV`.

You can also run individual tasks to debug problems:

{% highlight bash linenos %}
$ bitbake envsensord -c fetch      # only fetch the source
$ bitbake envsensord -c compile    # only compile
$ bitbake envsensord -c install    # only run do_install
{% endhighlight %}

## Adding application to your image

Once the recipe builds cleanly, add `envsensord` to your image, for our current setup simply just add it to the global local.conf file.

{% highlight bash linenos %}
IMAGE_INSTALL:append = " envsensord"
{% endhighlight %}

Then rebuild the image:

{% highlight bash linenos %}
$ bitbake core-image-minimal
{% endhighlight %}

Once the image is flashed and the board boots, you can verify that the service is running with:

{% highlight bash linenos %}
$ /etc/init.d/envsensord status
{% endhighlight %}

You can also start, stop, or restart the daemon manually:

{% highlight bash linenos %}
$ /etc/init.d/envsensord start
$ /etc/init.d/envsensord stop
$ /etc/init.d/envsensord restart
{% endhighlight %}
