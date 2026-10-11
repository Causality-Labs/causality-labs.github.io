---
layout: page
title: mcu-co SDK (September 2026- October 2026)
description: Linux SDK for mcu-co, a C shared library, CLI tool and example programs that let a Linux host drive the MCU co-processor over a serial link.
img: assets/img/blogs/mcu-co_Visual.png
importance: 1
category: Embedded-Linux
---

<h1 style="text-align: center;">Overview</h1>

<div class="row">
    <div class="col-md-12">
        {% include figure.liquid path="assets/img/mcu-co/SDK_Stack.png" class="img-fluid rounded z-depth-1 d-block mx-auto" width="50%" zoomable=true %}
    </div>
</div>

<div class="row mt-3">
    <div class="col-md-12">
        <p>mcu-co pairs a Linux host with a microcontroller that handles the timing-critical work, like PWM generation, interrupt handling and I/O expansion. The host stays free for high-level application logic, and the MCU gives it deterministic pin behavior without needing a real-time kernel. The microcontroller side is covered on the <a href="{% link _projects/mcu_co(MCU).md %}">mcu-co firmware page</a>.</p>

        <p>This page covers the Linux side of the project: the mcu-co SDK. It is made up of a shared library written in C (<code>libmcuco.so</code>), a CLI tool (<code>mcu-co-cli</code>) and a set of example programs. Applications call the library and never have to deal with the serial port or the command protocol themselves. The SDK is also packaged as a Yocto recipe, so it can be built into any custom embedded Linux image.</p>

        <p>This page is a high-level overview. The details are covered in their own posts: <a href="{% post_url 2026-09-19-mcu-co_Shared_Library_Linux %}">how to create a shared library in Linux</a> and <a href="{% post_url 2026-10-03-mcu-co_CLI %}">building the CLI</a>. Here is a link to <a href="https://causality-labs.github.io/blog/category/mcu-co/">all of these posts</a>.</p>

        <p>Source code for the SDK can be found here: <a href="https://github.com/Causality-Labs/mcu-co_sdk" target="_blank" rel="noopener">mcu-co SDK</a>, and the Yocto recipe here: <a href="https://github.com/Causality-Labs/meta-causality-labs/tree/main/meta-causality-apps/recipes-apps/mcu-co" target="_blank" rel="noopener">meta-causality-labs</a>.</p>
    </div>
</div>

<h1 style="text-align: center;">Shared Library</h1>

<div class="row">
    <div class="col-md-12">
        <p><code>libmcuco.so</code> gives applications a small C API for GPIO, interrupts and PWM. A program opens a handle to the serial port with <code>mcuco_open()</code>, calls functions like <code>mcuco_gpio_set()</code> or <code>mcuco_pwm_channel_set()</code>, and closes it when done.</p>

        <p>The library owns everything below that API. It builds each command frame, adds the CRC, sends it over the serial link and waits for the MCU's reply with a timeout. Every call returns a status code, and <code>mcuco_strerror()</code> turns it into a readable message, so an application can tell "that pin is already in use" apart from "the MCU didn't answer".</p>

        <p>The full design is covered in <a href="{% post_url 2026-09-19-mcu-co_Shared_Library_Linux %}">how to create a shared library in Linux</a>.</p>
    </div>
</div>

<h1 style="text-align: center;">CLI</h1>

<div class="row">
    <div class="col-md-12">
        <p><code>mcu-co-cli</code> exposes every library operation from the shell, which makes it useful for bring-up, testing and scripting. Each call runs one command, written as a subsystem, a verb and then values, for example <code>mcu-co-cli gpio set high A 5</code>.</p>

        <p>Values are printed on stdout and status messages on stderr, and the exit code is 0 on success and 1 on failure, so it works well in shell scripts. The serial port defaults to <code>/dev/ttyACM0</code> and can be changed with <code>-d</code>, and <code>--help</code> lists every command.</p>

        <p>The full design is covered in <a href="{% post_url 2026-10-03-mcu-co_CLI %}">building the CLI</a>.</p>
    </div>
</div>

<h1 style="text-align: center;">Example Programs</h1>

<div class="row">
    <div class="col-md-12">
        <p>The SDK comes with four small programs that show the library in use and make a good starting point for your own:</p>

        <ul>
            <li><strong><code>blink</code>:</strong> configures a pin as an output and drives it high and low.</li>
            <li><strong><code>pwm_frequency</code>:</strong> requests PWM group frequencies and reads back what the MCU actually achieved.</li>
            <li><strong><code>pwm_breathe</code>:</strong> fades an LED by ramping a PWM channel's duty cycle.</li>
            <li><strong><code>irq_bind</code>:</strong> binds an input pin's interrupt to toggle an output, handled entirely on the MCU.</li>
        </ul>
    </div>
</div>

<h1 style="text-align: center;">Yocto Recipe</h1>

<div class="row">
    <div class="col-md-12">
        <p>The SDK is also packaged as a recipe in my <a href="https://github.com/Causality-Labs/meta-causality-labs" target="_blank" rel="noopener">meta-causality-labs</a> Yocto layer. Anyone building a custom embedded Linux image can add the layer and get the library, CLI and examples cross-compiled for their target. If you are new to Yocto, my posts on <a href="{% post_url 2026-02-22-Creating-new-meta-layer %}">creating a new meta layer</a> and <a href="{% post_url 2026-03-20-Yocto-envsensord-recipe %}">writing a recipe</a> cover the background.</p>

        <p>The recipe is short, because the SDK's own CMake build does most of the work:</p>

        <ul>
            <li><strong>It fetches the SDK from GitHub at a pinned commit</strong>, so every build uses the same source.</li>
            <li><strong>It inherits <code>cmake</code></strong>, so Yocto runs the SDK's own build with the target's cross toolchain. Unit tests are turned off for the target build.</li>
            <li><strong>The examples go in their own package, <code>mcu-co-examples</code></strong>, so an image can ship the library and CLI without them.</li>
            <li><strong>The examples are installed with an <code>mcu-co-</code> prefix</strong>, because the SDK builds them but doesn't install them, and names like <code>blink</code> are too generic for <code>/usr/bin</code>.</li>
        </ul>

{% highlight bash linenos %}
SRC_URI = "git://github.com/Causality-Labs/mcu-co_sdk.git;protocol=https;branch=main"
SRCREV = "6a8455ac081cd587d6321ce9623becaa141ea5c5"
PV = "0.1.0+git"
S = "${WORKDIR}/git"

inherit cmake

EXTRA_OECMAKE = "-DBUILD_TESTING=OFF"

PACKAGES =+ "${PN}-examples"
FILES:${PN}-examples = " \
    ${bindir}/mcu-co-blink \
    ${bindir}/mcu-co-pwm_frequency \
    ${bindir}/mcu-co-irq_bind \
    ${bindir}/mcu-co-pwm_breathe \
"

# Upstream builds the examples but doesn't install them
do_install:append() {
    install -m 0755 ${B}/examples/blink ${D}${bindir}/mcu-co-blink
    install -m 0755 ${B}/examples/pwm_frequency ${D}${bindir}/mcu-co-pwm_frequency
    install -m 0755 ${B}/examples/irq_bind ${D}${bindir}/mcu-co-irq_bind
    install -m 0755 ${B}/examples/pwm_breathe ${D}${bindir}/mcu-co-pwm_breathe
}
{% endhighlight %}

        <p>To add it to an image, add the packages to <code>IMAGE_INSTALL</code>:</p>

{% highlight bash linenos %}
# conf/local.conf (or your image recipe)
IMAGE_INSTALL:append = " mcu-co mcu-co-examples"
{% endhighlight %}

        <p>The examples then show up on the target as <code>mcu-co-blink</code>, <code>mcu-co-pwm_breathe</code> and so on.</p>
    </div>
</div>

<h1 style="text-align: center;">Demo</h1>

<div class="row">
    <div class="col-md-12">
        <p>Below are a few of the things the SDK can do from the shell. See <a href="{% post_url 2026-10-03-mcu-co_CLI %}">the CLI post</a> for the full command set.</p>

        <p>Driving a GPIO pin:</p>

{% highlight bash linenos %}
mcu-co-cli gpio cfg output A 5                # make A5 an output
mcu-co-cli gpio set high A 5                  # drive it high
{% endhighlight %}

        <p>Running PA1 at 1 kHz and 25% duty:</p>

{% highlight bash linenos %}
mcu-co-cli timer cfg 1000 0                   # timer 0 at 1 kHz
mcu-co-cli pwm cfg active-high A 1            # claim A1 for PWM
mcu-co-cli pwm set 25 A 1                     # 25% duty
{% endhighlight %}

        <p>Binding a falling edge on one pin to a toggle on another. Once the binding is set, the MCU handles every edge itself and the host never has to respond:</p>

{% highlight bash linenos %}
mcu-co-cli gpio cfg input C 13                # make C13 an input
mcu-co-cli irq cfg falling C 13               # arm a falling-edge trigger on C13
mcu-co-cli irq bind falling C 13 toggle A 5   # each falling edge on C13 toggles A5
{% endhighlight %}
    </div>
</div>

<h1 style="text-align: center;">Conclusion</h1>

<div class="row">
    <div class="col-md-12">
        <p>The SDK completes the mcu-co project. A Linux application can now drive the co-processor through a small C library, a CLI covers the same operations from the shell, and the Yocto recipe lets the whole thing drop into a custom embedded Linux image. Together with the <a href="{% link _projects/mcu_co(MCU).md %}">firmware</a>, mcu-co gives a Linux host PWM, interrupt handling and I/O expansion with deterministic timing, without needing a real-time kernel.</p>

        <p>Feel free to fork the SDK repo and build on it.</p>

        <p>Again, you can find documentation and tutorials related to this project <a href="https://causality-labs.github.io/blog/category/mcu-co/">here</a>.</p>
    </div>
</div>
