// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "About",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-blog",
          title: "Blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "nav-projects",
          title: "Projects",
          description: "Some projects I have worked on I have split the according if they are MCU, FPGA or SBC based.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "nav-repositories",
          title: "Repositories",
          description: "My public github repositories",
          section: "Navigation",
          handler: () => {
            window.location.href = "/repositories/";
          },
        },{id: "post-mcu-co-how-to-write-a-uart-driver-mcu-co-p2",
        
          title: "mcu-co How to write a UART driver (mcu-co P2)",
        
        description: "Learn the fundamentals of writing a good driver by writing one for a UART peripheral",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/mcu-co_How_to_write_good_Driver/";
          
        },
      },{id: "post-mcu-co-proposal-mcu-co-p1",
        
          title: "mcu-co Proposal (mcu-co P1)",
        
        description: "Introducing mcu-co, a professional-grade real-time I/O accelerator that bridges a Linux host to a dedicated co-processor for deterministic hardware execution",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/mcu-co_Proposal/";
          
        },
      },{id: "post-building-envsensord-in-yocto-p6",
        
          title: "Building envsensord in Yocto P6",
        
        description: "Writing a Yocto recipe to build and deploy envsensord as a Daemon",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/Yocto-envsensord-recipe/";
          
        },
      },{id: "post-adding-bme280-kernel-support-in-yocto-p5",
        
          title: "Adding BME280 Kernel Support in Yocto P5",
        
        description: "Adding device tree and kernel driver support for the BME280 sensor using Yocto",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/Yocto-BME280-Kernel-Support/";
          
        },
      },{id: "post-yocto-sdk-p4",
        
          title: "Yocto-SDK P4",
        
        description: "Deploying a Yocto SDK in a Docker Container for Embedded Linux Development",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/Yocto-SDK/";
          
        },
      },{id: "post-creating-a-new-yocto-meta-layer-p3",
        
          title: "Creating a new Yocto Meta Layer P3",
        
        description: "Showcasing how to create a new Yocto Layer",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/Creating-new-meta-layer/";
          
        },
      },{id: "post-booting-an-image-from-a-remote-source-p2",
        
          title: "Booting an Image from a remote source P2",
        
        description: "Showcasing how to boot the rootfs, kernel and dtb remotely vis NFS and TFTP",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/Booting-Embedded-Linux-Image-Remotely/";
          
        },
      },{id: "post-a-quick-guide-on-docker-basics",
        
          title: "A quick guide on Docker basics",
        
        description: "A post about my experience getting started with Docker",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2025/Docker_Basics/";
          
        },
      },{id: "post-getting-started-with-yocto-poky-and-first-image-p1",
        
          title: "Getting started with Yocto (Poky and First Image) P1",
        
        description: "Documenting using yocto in my Personal Life",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2025/Yocto_Intro/";
          
        },
      },{id: "post-getting-started-with-zephyr",
        
          title: "Getting started with Zephyr",
        
        description: "A post about my experience getting started with Zephyr",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2025/Zephry_Intro/";
          
        },
      },{id: "books-the-godfather",
          title: 'The Godfather',
          description: "",
          section: "Books",handler: () => {
              window.location.href = "/books/the_godfather/";
            },},{id: "news-a-simple-inline-announcement",
          title: 'A simple inline announcement.',
          description: "",
          section: "News",},{id: "news-a-long-announcement-with-details",
          title: 'A long announcement with details',
          description: "",
          section: "News",handler: () => {
              window.location.href = "/news/announcement_2/";
            },},{id: "news-a-simple-inline-announcement-with-markdown-emoji-sparkles-smile",
          title: 'A simple inline announcement with Markdown emoji! :sparkles: :smile:',
          description: "",
          section: "News",},{id: "projects-ble-ecg-logger-january-2024",
          title: 'BLE ECG Logger (January 2024)',
          description: "Award-winning Bluetooth Low Energy ECG monitoring system that captures and wirelessly transmits heart activity data - 1st Place Winner at HackED 2024 Hackathon",
          section: "Projects",handler: () => {
              window.location.href = "/projects/BLE_ECG_Logger/";
            },},{id: "projects-ble-proximity-detector-may-2023-december-2023",
          title: 'BLE Proximity Detector (May 2023 - December 2023)',
          description: "A Bluetooth Low Energy system for real-time proximity detection between electromagnetic sensors and probes, featuring dual PCB modules and a custom PC interface with visual and audio feedback",
          section: "Projects",handler: () => {
              window.location.href = "/projects/BLE_Prox_Dect/";
            },},{id: "projects-causality-soc-june-2025-august-2025",
          title: 'Causality SoC (June 2025 - August 2025)',
          description: "Custom FPGA SoC on Basys 3 using Verilog and C, featuring a flexible HAL and Snake game demo",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Causality_SoC/";
            },},{id: "projects-envsensord-december-2025-january-2026",
          title: 'envsensord (December 2025 - January 2026)',
          description: "Environmental sensor daemon that exposes BME280 temperature, pressure, and humidity data over TCP/IP with C++ and Python client implementations for remote monitoring.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Env_Sensor_Daemon/";
            },},{
        id: 'social-cv',
        title: 'CV',
        section: 'Socials',
        handler: () => {
          window.open("/assets/pdf/resume.pdf", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/ime-asamudo", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
