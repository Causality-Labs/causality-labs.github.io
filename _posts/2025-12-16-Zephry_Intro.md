---
layout: post
title: Getting started with Zephyr
date: 2025-12-16 16:40:16
description: A post about my experience getting started with Zephyr
tags: MCU RTOS
---

## Introduction

I decided to try Zephyr RTOS because of its increased user base in the world of embedded systems. As an open-source RTOS backed by the Linux Foundation, it's gaining traction for IoT and embedded projects. The extensive hardware support and security focus made it an appealing choice to explore.

I used the nRF Connect SDK in VS Code since it comes bundled with Zephyr, making it easy to get started.

To showcase Zephyr, I decided to demo it being used in an Environmental Sensor Application. The components used are the following:

- **nRF52840 Discovery Kit** - The main development board featuring Bluetooth LE and plenty of GPIO
- **BME280** - Temperature, humidity, and atmospheric pressure sensor
- **SGP40** - VOC (Volatile Organic Compounds) gas sensor for air quality monitoring
- **SCD40** - CO2 and temperature sensor for indoor air quality assessment

The source code for this ongoing project can be found here [Zephyr Env Sensor](https://github.com/Causality-Labs/Env_Sensor)

## Steps

I did this on a Windows machine.

### 1. Environment Setup
- Install nRF Connect SDK in VS Code

### 2. Project Initialization
- Configure `prj.conf` with required modules (sensors, Bluetooth, etc.)

{% highlight ini linenos %}
# Core
CONFIG_SENSOR=y
CONFIG_I2C=y
CONFIG_PM_DEVICE=y

# BME280 driver
CONFIG_PM_DEVICE=y

# C++ support
CONFIG_CBPRINTF_FP_SUPPORT=y

# SCD40 driver
CONFIG_SCD4X=y
CONFIG_PRINTK=y
{% endhighlight %}

### 3. Device Tree Configuration
- Define sensor nodes in device tree overlay in a file called `nrf52840dk_nrf52840.overlay`

{% highlight c linenos %}
&i2c0 {
	status = "okay";
	clock-frequency = <I2C_BITRATE_FAST>;
	pinctrl-0 = <&i2c0_default>;
	pinctrl-1 = <&i2c0_sleep>;
	pinctrl-names = "default", "sleep";

	bme280_0: bme280@76 {
		compatible = "bosch,bme280";
		status = "okay";
		reg = <0x76>;
	};

	sgp40_0: sgp40@59 {
		compatible = "sensirion,sgp40";
		status = "okay";
		reg = <0x59>;
	};

	scd40_0: scd40@62 {
		compatible = "sensirion,scd40";
		status = "okay";
		reg = <0x62>;
	};
};

&pinctrl {
	/omit-if-no-ref/ i2c0_default: i2c0_default {
		group1  {
			psels = <NRF_PSEL(TWIM_SCL, 1, 14)>,
					<NRF_PSEL(TWIM_SDA, 1, 15)>;
		};
	};

	/omit-if-no-ref/ i2c0_sleep: i2c0_sleep {
		group1  {
			psels = <NRF_PSEL(TWIM_SCL, 1, 14)>,
					<NRF_PSEL(TWIM_SDA, 1, 15)>;
			low-power-enable;
		};
	};
};
{% endhighlight %}

This configuration:

- Enables I2C0 bus with fast mode (400kHz)
- Maps each sensor to its I2C address
- Configures pin control for power management

### 4. Application Development
I implemented a multi-threaded application with separate threads for each sensor and a display thread. The architecture includes:

Hardware Abstraction Layer (HAL)
I created clean HAL interfaces for each sensor:

- bme280_hal.c/h - BME280 temperature/humidity/pressure
- sgp40_hal.c/h - SGP40 VOC index calculation
- scd40_hal.c/h - SCD40 CO2 measurements

Threading Architecture

{% highlight c linenos %}
K_THREAD_DEFINE(bme_id, STACK_SIZE, bme_thread, NULL, NULL, NULL, BME_THREAD_PRIORITY, 0, 0);
K_THREAD_DEFINE(sgp_id, STACK_SIZE, sgp_thread, NULL, NULL, NULL, SGP_THREAD_PRIORITY, 0, 0);
K_THREAD_DEFINE(scd_id, STACK_SIZE, scd_thread, NULL, NULL, NULL, SCD_THREAD_PRIORITY, 0, 0);
K_THREAD_DEFINE(disp_id, STACK_SIZE, display_thread, NULL, NULL, NULL, DISPLAY_THREAD_PRIORITY, 0, 0);
{% endhighlight %}


Inter-Thread Communication
I used Zephyr's message queues for safe data passing between threads:

{% highlight c linenos %}
K_MSGQ_DEFINE(bme280_msgq, sizeof(struct bme280_sample), 5, 1);
K_MSGQ_DEFINE(sgp40_msgq, sizeof(int32_t), 5, 1);
K_MSGQ_DEFINE(scd40_msgq, sizeof(double), 5, 1);
{% endhighlight %}



## Key Features I Explored

The Zephyr features that stood out to me:

### Unified Sensor API
Zephyr's sensor subsystem provides a consistent interface across different sensor types. The `sensor_sample_fetch()` and `sensor_channel_get()` pattern works seamlessly with BME280, SCD40, and SGP40 sensors.

### Device Tree Integration
The device tree system makes hardware configuration declarative and maintainable. Adding new sensors is as simple as updating the overlay file without touching application code.

### Threading and Synchronization
Zephyr's threading primitives (`K_THREAD_DEFINE`, `K_MSGQ_DEFINE`) make concurrent programming straightforward. The message queue system provides type-safe inter-thread communication.

### Real-time Capabilities
Each sensor thread runs independently with configurable priorities, ensuring time-critical measurements aren't blocked by slower operations.

## Next Steps

### Bluetooth LE Integration
Add BLE GATT services to expose sensor readings wirelessly, leveraging Nordic's SoftDevice integration in nRF Connect SDK. This would enable an **Environmental Service**: a custom GATT service with characteristics for temperature, humidity, pressure, CO2, and VOC readings.