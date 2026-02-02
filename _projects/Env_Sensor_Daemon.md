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
        {% include figure.liquid path="assets/img/EnvSensord/BeagleBone.jpeg" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

<div class="row">
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

<h4>Server</h4>

<p>Execute the program as a background process:</p>
{% highlight bash linenos %}
$ ./EnvSensord &
{% endhighlight %}

<p>The server supports the following options:</p>
{% highlight bash linenos %}
$ ./EnvSensord [OPTIONS]
{% endhighlight %}

<p><strong>Options:</strong></p>
<ul>
    <li><code>-p, --port PORT</code> - Server port (default: 3500)</li>
    <li><code>-t, --threads NUM</code> - Number of worker threads (default: 4)</li>
    <li><code>-i, --interval MS</code> - Sensor update interval in milliseconds (default: 1000)</li>
    <li><code>-d, --device NAME</code> - Device name for logging (optional)</li>
    <li><code>-h, --help</code> - Show help message</li>
    <li><code>-v, --version</code> - Show version information</li>
</ul>

<p><strong>Examples:</strong></p>
{% highlight bash linenos %}
$ ./EnvSensord --port 8080 --threads 8
$ ./EnvSensord -p 3500 -i 500
{% endhighlight %}

<h4>Client</h4>

<p>There are two client implementations available: a compiled C++ client and a Python script.</p>

<h5>Compiled C++ Client</h5>

<p>The compiled client is built from <a href="https://github.com/Causality-Labs/envsensord/blob/main/src/client.cpp" target="_blank" rel="noopener">src/client.cpp</a> and provides a native interface to query the sensor server.</p>

<p><strong>Usage:</strong></p>
{% highlight bash linenos %}
$ ./EnvClient-cli [OPTIONS]
{% endhighlight %}

<p><strong>Options:</strong></p>
<ul>
    <li><code>-H, --host HOSTNAME</code> - Server hostname or IP address (default: localhost)</li>
    <li><code>-p, --port PORT</code> - Server port (default: 3500)</li>
    <li><code>-t, --temp</code> - Request temperature data</li>
    <li><code>-u, --humid</code> - Request humidity data</li>
    <li><code>-r, --press</code> - Request pressure data</li>
    <li><code>-a, --all</code> - Request all sensor values (default if none specified)</li>
    <li><code>-h, --help</code> - Show help message</li>
    <li><code>-v, --version</code> - Show version information</li>
</ul>

<p><strong>Examples:</strong></p>
{% highlight bash linenos %}
$ ./EnvClient-cli                          # Request all values from localhost:3500
$ ./EnvClient-cli -t                       # Request only temperature
$ ./EnvClient-cli -t -u                    # Request temperature and humidity
$ ./EnvClient-cli -p 8080 -a               # Request all from port 8080
$ ./EnvClient-cli -H 192.168.1.100 -t      # Request temp from remote host
{% endhighlight %}

<h5>Python Client Script</h5>

<p>The Python client (<a href="https://github.com/Causality-Labs/envsensord/blob/main/envSensorClient.py" target="_blank" rel="noopener">envSensorClient.py</a>) provides a portable alternative that requires no compilation.</p>

<p><strong>Requirements:</strong></p>
<ul>
    <li>Python 3.x</li>
    <li>No external dependencies (uses standard library only)</li>
</ul>

<p><strong>Usage:</strong></p>
{% highlight bash linenos %}
$ python3 envSensorClient.py [OPTIONS]
{% endhighlight %}

<p>Or make it executable and run directly:</p>
{% highlight bash linenos %}
$ chmod +x envSensorClient.py
$ ./envSensorClient.py [OPTIONS]
{% endhighlight %}

<p><strong>Options:</strong></p>
<ul>
    <li><code>-H, --host</code> - Server hostname or IP (default: localhost)</li>
    <li><code>-p, --port</code> - Server port (default: 3500)</li>
    <li><code>-t, --temp</code> - Request temperature data</li>
    <li><code>-u, --humid</code> - Request humidity data</li>
    <li><code>-r, --press</code> - Request pressure data</li>
    <li><code>-a, --all</code> - Request all sensor values (default if none specified)</li>
</ul>

<p><strong>Examples:</strong></p>
{% highlight bash linenos %}
$ python3 envSensorClient.py                          # Request all values
$ python3 envSensorClient.py -t                       # Request only temperature
$ python3 envSensorClient.py -H 192.168.1.100 -t -u   # Request temp and humidity from remote host
$ python3 envSensorClient.py --host server.local --port 8080 --all
{% endhighlight %}

<h4>Stress Testing</h4>

<p>The <a href="https://github.com/Causality-Labs/envsensord/blob/main/test_server.sh" target="_blank" rel="noopener">test_server.sh</a> script allows you to stress test the server by running multiple concurrent client connections.</p>

<p><strong>Usage:</strong></p>
{% highlight bash linenos %}
$ ./test_server.sh [NUM_CLIENTS] [CLIENT_TYPE]
{% endhighlight %}

<p><strong>Arguments:</strong></p>
<ul>
    <li><code>NUM_CLIENTS</code> - Number of concurrent clients to run (default: 5)</li>
    <li><code>CLIENT_TYPE</code> - Which client to test: <code>cpp</code>, <code>python</code>, or <code>both</code> (default: both)</li>
</ul>

<p><strong>Options:</strong></p>
<ul>
    <li><code>-h, --help</code> - Show help message</li>
</ul>

<p><strong>Features:</strong></p>
<ul>
    <li>Launches multiple clients concurrently with varied requests (temperature, humidity, pressure, or all)</li>
    <li>Tracks success/failure rates for each client</li>
    <li>Measures total duration and requests per second</li>
    <li>Saves detailed logs to <code>logs/test_TIMESTAMP/</code> directory</li>
    <li>Displays failed client outputs for debugging</li>
    <li>Small stagger between launches (50ms) to simulate realistic traffic</li>
</ul>

<p><strong>Examples:</strong></p>
{% highlight bash linenos %}
$ ./test_server.sh                    # Test with 5 clients of each type
$ ./test_server.sh 20                 # Test with 20 clients of each type
$ ./test_server.sh 50 cpp             # Test with 50 C++ clients only
$ ./test_server.sh 100 python         # Test with 100 Python clients only
$ ./test_server.sh 200 both           # Stress test with 200 of each type
$ ./test_server.sh -h                 # Show help message
{% endhighlight %}

<p><strong>Output:</strong></p>
<p>The script provides detailed statistics including:</p>
<ul>
    <li>Total clients launched</li>
    <li>Success and failure counts</li>
    <li>Test duration</li>
    <li>Requests per second</li>
    <li>Location of log files</li>
    <li>Error messages from failed clients (if any)</li>
</ul>

    </div>
</div>


<h1 style="text-align: center;">Conclusion</h1>

<div class="row">
    <div class="col-md-12">
        <p>The next step for this project is to add it to my custom Yocto layer, allowing others to easily integrate it into their own custom embedded Linux images. Please feel free to fork the repo and modify it to fit your needs.</p>
    </div>
</div>