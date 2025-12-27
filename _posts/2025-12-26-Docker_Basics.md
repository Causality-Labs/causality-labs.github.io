---
layout: post
title: A quick guide on Docker basics
date: 2025-12-26 16:40:16
description: A post about my experience getting started with Docker
tags: Misc
categories:
---

## Introduction

### My Experience with Docker so far
During my professional experience so far, I have been exposed to Docker containers multiple times. I have used Docker containers for consistent build environments when working with Yocto, and I have worked on applications deployed in Docker containers on embedded platforms. 

I thought it would be helpful for me and others who are just starting their software journey to take a step back and truly understand what Docker is, why it is so popular in the industry, and then go over some of the basic Docker commands to get you up and running.


### What is Docker and Why is it so Popular
Docker is a tool that packages an application and all its dependencies into a lightweight, portable container, ensuring it runs consistently across any environment. By doing this, your application can run the same way whether it is deployed on a laptop, a powerful server, or an embedded platform.

Docker is popular in the industry for the following reasons:

1. **Consistency ("It works on my machine"):** Docker eliminates the common problem where code works in development but fails in production due to different library versions or OS configurations.
2. **Efficiency:** Unlike Virtual Machines (VMs), containers share the host system's kernel. This makes them much smaller, faster to start, and less resource-intensive.
3. **Isolation:** Each container runs in its own isolated environment. You can run multiple applications with conflicting dependencies on the same host without them interfering with each other.
4. **Scalability and Ecosystem:** With Docker Hub, there is a massive library of pre-built images (like databases, web servers, and compilers) that you can pull and use instantly, significantly speeding up development and deployment.

If you would like to learn more about Docker, you can find details in the official Docker [documentation](https://docs.docker.com/get-started/docker-overview/).


## Getting Started with Docker
We will be demonstrating how we can use Docker based on a simple TCP/IP client-server application written in C++. The source code for this demo can be found here: [Docker Demo](https://github.com/Causality-Labs/Docker_Lesson)

The layout for the source code for our application is as follows:

{% highlight bash linenos %}
$ tree .
.
├── client.py
├── inc
│   ├── logger.hpp
│   └── my_socket_lib.hpp
├── Makefile
├── README.md
├── src
│   ├── client.cpp
│   ├── my_socket_lib.cpp
│   └── server.cpp
└── test_server.sh
{% endhighlight %}

- **`src/` & `inc/`**: The C++ code for our application.
- `Makefile`: Instructions for building the code.
- `client.py` & `test_server.sh`: Scripts to test that the server works.

The first step for containerization is that we need a `Dockerfile`. As stated above, a `Dockerfile` gives us instructions for building a Docker container. This is what our `Dockerfile` should look like:

{% highlight Dockerfile linenos %}
FROM ubuntu:24.04

# Install dependencies
RUN apt-get -y update && \
    apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++

WORKDIR /app

# Copy specific files
COPY Makefile /app/
COPY client.py /app/
COPY test_server.sh /app/

# Copy specific directories
COPY src/ /app/src/
COPY inc/ /app/inc/

RUN chmod +x /app/test_server.sh
RUN chmod +x /app/client.py

RUN make clean && make all

# Run the server (not the test script)
CMD ["./bin/server"]
{% endhighlight %}


- `FROM ubuntu:24.04`: Starts with a clean Ubuntu Linux operating system as the base.
- `RUN apt-get...`: Installs the necessary tools (Python, Make, and a C++ compiler) inside that Ubuntu system.
- `WORKDIR /app`: Creates a folder called `/app` inside the container and moves into it (like `cd /app`).
- `COPY ...`: Copies your source code, Makefile, and scripts from your computer into the container’s `/app` folder.
- `RUN chmod +x ...`: Gives the scripts permission to run.
- `RUN make...`: Compiles your C++ code into a finished executable program.
- `CMD ["./bin/server"]`: Tells Docker to run your server program when the container starts.

Your Dockerfile now gives you the ability to create a Docker Image. A Docker Image is a read-only template that contains your application code, libraries, and all the dependencies required for it to run. You can think of the **Dockerfile** as the "recipe" and the **Image** as the "finished dish" that is ready to be served.

To build your image, you use the `docker build` command:

{% highlight bash linenos %}
$ docker build -t my-server .
{% endhighlight %}

This command uses the `Dockerfile` in the current directory to build your image and tags it as `my-server`.

Next up you can run the Docker Container from the image with the following command:

{% highlight bash linenos %}
# Pattern:
# docker run -d -p <host>:<container>  --name <container-name> <image-name>
$ docker run -d -p 3500:3500 --name my-server my-server
{% endhighlight %}

- Detached: Runs in the background (`-d`).
- Ports: Maps host port `3500` to container port `3500` (`-p 3500:3500`).
- Name: Sets the container name to `my-server` (`--name`).
- Image: Starts a container from the image `my-server`.
- Access: Reach the app at `http://localhost:3500` if it listens on port `3500` inside the container.


You can verify your container is running with the following command and you should see a similar output:
{% highlight bash linenos %}
$ docker ps
CONTAINER ID   IMAGE       COMMAND          CREATED         STATUS         PORTS                                         NAMES
0d4bfd75ba8e   my-server   "./bin/server"   3 seconds ago   Up 3 seconds   0.0.0.0:3500->3500/tcp, [::]:3500->3500/tcp   my-server
{% endhighlight %}

The server is running inside the container, and port `3500` is exposed from the container to port `3500` on the host. This lets a client on the host communicate with the server inside the Docker container.
{% highlight bash linenos %}
$ ./bin/client
[HW_Client] [INFO] Connecting to server...
[HW_Client] [INFO] Connected to server!
[HW_Client] [INFO] Sending: Hello from C++ client!
[HW_Client] [INFO] Server response: Hello from C++ client!
[HW_Client] [INFO] Disconnected from server
{% endhighlight %}

You can see the server logs in the container by running this command:
{% highlight bash linenos %}
$ docker logs -f my-server
[HW_Server] [INFO] Server listening on port 3500...
[HW_Server] [INFO] Client connected
[HW_Server] [INFO] Received: Hello from C++ client!
[HW_Server] [INFO] Response sent to client
{% endhighlight %}

This command stops the container:
{% highlight bash linenos %}
$ docker stop my-server
{% endhighlight %}

You can also enter the container via interactive mode and run the test script manually:
{% highlight bash linenos %}
# Start the container if it's not running already:
$ docker start my-server

# Enter a shell
$ docker exec -it my-server /bin/bash

# Check running processes in container:
root@799f684fc374:/app# ps aux
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root           1  0.0  0.0   6368  3584 ?        Ss   20:01   0:00 ./bin/server
root           7  0.0  0.0   4588  3968 pts/0    Ss   20:02   0:00 /bin/bash
root          18  0.0  0.0   7888  4096 pts/0    R+   20:03   0:00 ps auxr
{% endhighlight %}

This gives you a bash shell inside the running container. You can then run commands like:
{% highlight bash linenos %}
./test_server.sh
{% endhighlight %}

Exit the container shell with `exit`.

To remove a container, use the command:
{% highlight bash linenos %}
$ docker rm my-server
{% endhighlight %}