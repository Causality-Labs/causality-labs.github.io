---
layout: page
title: EnvSensord (December 2025 - January 2026)
description: Environmental sensor daemon that exposes BME280 temperature, pressure, and humidity data over TCP/IP with C++ and Python client implementations for remote monitoring.
img: assets/img/EnvSensord/BeagleBone.jpeg
importance: 1
category: Embedded-Linux
---

<h1 style="text-align: center;">Overview</h1>

<div class="row">
    <div class="col-md-12">
        {% include figure.liquid path="assets/img/EnvSensord/BeagleBone.jpeg" class="img-fluid rounded z-depth-1 even-height-img" %}
    </div>
</div>

<div class="row mt-3">
    <div class="col-md-12">
        <p>The Environmental Sensor Daemon is a multi-threaded server application that provides network-accessible environmental data from a BME280 sensor. It demonstrates common Embedded Linux design patterns including network socket programming, boss-worker threading models, and client-server architecture. The daemon runs as a background service, allowing multiple concurrent clients to query real-time temperature, humidity, and pressure readings over TCP/IP.</p>

        <p>The project includes two Command Line Interface (CLI) clients for interacting with the daemon: one implemented in C++ and another in Python, demonstrating cross-language compatibility and ease of integration.</p>

        <p>Source code for this project can be found here: <a href="https://github.com/Causality-Labs/envsensord" target="_blank" rel="noopener">Envsensord</a>.</p>
    </div>
</div>

<h1 style="text-align: center;">Hardware</h1>

<div class="row">
    <div class="col-md-6">
        {% include figure.liquid path="assets/img/EnvSensord/envsensordHW.png" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-md-6">
        <p>The hardware for this project includes a BeagleBone Black single board computer and a BME280 sensor connected over an I2C bus:</p>

        <p><strong>Linux SBC (BeagleBone Black):</strong> A BeagleBone Black was used as the Linux SBC for prototyping, but any Linux-capable SBC can also be used. The program just needs to be cross-compiled for the specific architecture and a valid device tree for the BME280 sensor must be provided.</p>

        <p><strong>BME280:</strong> The BME280 was chosen for this project because it is an easy-to-use sensor with a readily available kernel driver.</p>
    </div>
</div>

<h1 style="text-align: center;">Software</h1>

<div class="row">
    <div class="col-md-12">
        {% include figure.liquid path="assets/img/EnvSensord/OverallSWDiagram.png" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

<div class="row">
    <div class="col-md-12">
        <p>This application has two parts: EnvSensord (the C++ server) and client programs written in C++ and Python.</p>

        <p><strong>EnvSensord (Server):</strong> This background daemon communicates with the BME280 sensor to read temperature, humidity, and pressure. The server uses a multi-threaded boss–worker architecture where worker threads handle client requests.</p>

        <p><strong>Clients:</strong> Clients are command-line programs (one in C++, one in Python) that connect to the daemon over TCP/IP to request sensor readings, receive responses using the Simple Sensor Network Protocol (SSNP), and display or log the data.</p>

         <p><strong>Simple Sensor Network Protocol (SSNP):</strong> SSNP is a minimal application-layer protocol used by clients to request one or more sensor fields from the daemon. A request is a comma-separated list of field names terminated by a semicolon. Valid fields are: <strong>TEMP</strong>, <strong>PRESS</strong>, and <strong>HUMID</strong>.</p>

         <p>Rules:</p>
         <ul>
             <li>Fields are comma-separated (no spaces required).</li>
             <li>Request must end with a semicolon (<code>;</code>).</li>
             <li>At least one field is required; a maximum of three fields (one per valid sensor) is allowed.</li>
             <li>No duplicate fields are allowed.</li>
             <li>Fields may appear in any order.</li>
         </ul>

         <p>Examples:</p>
        <ul>
            <li><code>TEMP;</code></li>
            <li><code>TEMP,PRESS;</code></li>
            <li><code>TEMP,PRESS,HUMID;</code></li>
            <li><code>HUMID,TEMP;</code></li>
         </ul>
        
        <p><strong>Response format:</strong> <code>HEADER;timestamp,values</code></p>
        <ul>
            <li><strong>HEADER</strong> matches the request fields.</li>
            <li><strong>Values</strong> include units: TEMP (°C), PRESS (hPa), HUMID (%).</li>
        </ul>
        <p><strong>Example:</strong> <code>TEMP,PRESS;1738454400,23.50C,1013.25hPa</code></p>
    </div>
</div>

<h1 style="text-align: center;">Demo</h1>

<div class="row">
<div class="col-md-12">
    <p>Run the server in background:</p>
    {% highlight bash linenos %}
    $ ./EnvSensord &
    {% endhighlight %}

    <p>Use the provided clients to query the daemon — the C++ client (<code>EnvClient-cli</code>) and the Python script (<code>envSensorClient.py</code>) both support requesting TEMP, PRESS, and HUMID. Example:</p>

    {% highlight bash linenos%}
    $ ./EnvClient-cli -t            # request temperature
    $ python3 envSensorClient.py -a  # request all values
    {% endhighlight %}

    <p>For full CLI options, stress-testing and implementation details see the project repository (source and scripts are included there).</p>

    <p>A script called test_server.sh was also included to simulate concurrent clients and collect performance stats. Before running it however make user envsensord is running in the background.</p>
    {% highlight bash linenos %}
    $ ./test_server.sh                    # default: 5 clients of each type
    $ ./test_server.sh 20                 # 20 clients of each type
    $ ./test_server.sh 50 cpp             # 50 C++ clients only
    $ ./test_server.sh 100 python         # 100 Python clients only
    $ ./test_server.sh 200 both           # 200 of each type
    {% endhighlight %}

    <p><strong>Output:</strong> The script reports totals, success/failure counts, duration, requests/sec.</p>

    </div>
</div>


<h1 style="text-align: center;">Conclusion</h1>

<div class="row">
    <div class="col-md-12">
        <p>The next step for this project is to add it to my custom Yocto layer, allowing others to easily integrate it into their own custom embedded Linux images. Please feel free to fork the repo and modify it to fit your needs.</p>
    </div>
</div>