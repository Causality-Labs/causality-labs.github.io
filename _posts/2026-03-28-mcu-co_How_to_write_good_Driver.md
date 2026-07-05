---
layout: post
title: mcu-co How to write a UART driver (mcu-co P2)
date: 2026-03-22 09:40:16
description: Learn the fundamentals of writing a good driver by writing one for a UART peripheral
tags: MCU
categories: mcu-co
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## Introduction

For the mcu-co, I decided to go bare-metal rather than the CubeMX route, simply because I wanted to extract as much knowledge as possible from doing this project, and by using the drivers and the HAL that CubeMX gives me, I felt I would be missing out on this experience. Going the bare-metal route definitely adds a lot more complexity and increases the amount of time it takes to finish the project; however, I feel it is well worth it because of the experience that it will grant me. Because we are going bare-metal, I will have to write my own drivers for the peripherals I will be using on the MCU. One of the most common peripherals that one might have to write their own driver for is a UART peripheral. In this post, I will go over how to write a good driver and the practices I like to follow when writing a driver.

I will not be going over what UART is at a high level, as that is not the focus of this post, but if you would like to learn more about UART in detail, here is a [website] you can use to do that. For this post, all I will say is UART is a common serial communication protocol that is often used for debug/logging consoles, bootloaders/firmware flashing, and GPS modules. For mcu-co, we will be using UART for two things: debugging/logging and as the communication link from the MCU to the SoC running Linux.

## Data Structures

First thing to go over are the data structures used for this driver.

**uart_config_t**: A struct that allows the user to configure the UART peripheral. Here is what it looks like:
{% highlight c linenos %}
/** @brief UART peripheral configuration parameters. */
typedef struct {
    uart_baudrate_t baudrate;
    uart_parity_t parity;
    uart_data_width_t data_width;
    uart_stop_bits_t stop_bits;
    uart_mode_t mode;
} uart_config_t;
{% endhighlight %}

And here are the enumerations the user can use to set these fields:

{% highlight c linenos %}
/** @brief Supported baud rates. */
typedef enum {
    UART_BAUD_9600   = 9600U,
    UART_BAUD_19200  = 19200U,
    UART_BAUD_38400  = 38400U,
    UART_BAUD_57600  = 57600U,
    UART_BAUD_115200 = 115200U,
} uart_baudrate_t;

/** @brief Parity mode selection. */
typedef enum {
    UART_PARITY_NONE = 0U,
    UART_PARITY_EVEN = 1U,
    UART_PARITY_ODD  = 2U,
} uart_parity_t;

/** @brief Data frame width selection. */
typedef enum {
    UART_DATA_8BIT = 0U,
    UART_DATA_9BIT = 1U,
    UART_DATA_7BIT = 2U,
} uart_data_width_t;

/** @brief Number of stop bits. */
typedef enum {
    UART_STOP_1BIT = 0U,
    UART_STOP_2BIT = 1U,
} uart_stop_bits_t;

/** @brief TX, RX, or bidirectional mode. */
typedef enum {
    UART_MODE_TX    = 0U,
    UART_MODE_RX    = 1U,
    UART_MODE_TX_RX = 2U,
} uart_mode_t;
{% endhighlight %}

By using C **enums** we force the user to only configure UART with known values, as if they try to set other values their program would not compile.

**uart_instance_t**: This is an enum that allows the user to select whichever UART channel/bus they would like to use. The MCU we are using, the STM32G474RE, has 6 UART channels; for mcu-co, we will be using two of them.
{% highlight c linenos %}
/** @brief UART peripheral instance identifiers. */
typedef enum {
    UART_INSTANCE_USART1  = 0U,
    UART_INSTANCE_USART2  = 1U,
    UART_INSTANCE_USART3  = 2U,
    UART_INSTANCE_UART4   = 3U,
    UART_INSTANCE_UART5   = 4U,
    UART_INSTANCE_LPUART1 = 5U,
} uart_instance_t;
{% endhighlight %}

**uart_rx_buffer_t**: This is the data structure for the receive buffer. It's a struct comprising a **uint8_t** pointer and a size variable. The buffer is then set up as a ring buffer that the UART peripheral will pass received characters into.
{% highlight c linenos %}
/**
 * @brief Caller-supplied RX ring buffer storage.
 *
 * @p buffer must remain valid for the lifetime of the UART instance.
 * @p size must be a power of 2.
 */
typedef struct {
    uint8_t *buffer;
    uint16_t size;
} uart_rx_buffer_t;
{% endhighlight %}

## API's
{% highlight c linenos %}
/**
 * @brief Initialise a UART peripheral.
 *
 * Enables the peripheral clock, configures GPIO pins, baud rate, frame
 * format, and mode. For RX-capable modes, initialises the ring buffer
 * and enables the RXNE interrupt.
 *
 * @param instance  UART peripheral to initialise
 * @param config    Pointer to frame and mode configuration
 * @param rx_buffer Caller-supplied RX buffer; required for RX/TX_RX modes, NULL for TX-only
 * @return STATUS_OK on success, STATUS_ERR_INVALID_ARG on bad arguments,
 *         STATUS_ERR_BUSY if already initialised or its pins are in use,
 *         STATUS_ERR_NOT_INIT if the clock/GPIO could not be brought up,
 *         STATUS_ERR_TIMEOUT if the peripheral did not become ready.
 */
status_t uart_init(uart_instance_t instance, const uart_config_t *config,
                   const uart_rx_buffer_t *rx_buffer);
{% endhighlight %}

**uart_init**: This is the function used to initialize the UART channel of choice with your specific configuration and receive buffer. Here are some ways this function can be used to initialize a TX-only UART instance and a RX/TX UART instance:

Say you wanted to make a logger that only transmits characters. There would be no need to create a receive buffer in this use case, so here is an example of how one could set up the UART channel:
{% highlight c linenos %}
static const uart_instance_t uart_logger = UART_INSTANCE_USART1;

static int init_uart_logger_hw(void)
{
    const uart_config_t config = {
        .baudrate   = UART_BAUD_115200,
        .data_width = UART_DATA_8BIT,
        .parity     = UART_PARITY_NONE,
        .stop_bits  = UART_STOP_1BIT,
        .mode       = UART_MODE_TX,
    };

    if (uart_init(uart_logger, &config, NULL) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}

Now say you want to set up a terminal instance, meaning you want to be able to write characters into your UART peripheral. This means you would want to have initialized a receive buffer; here's how that could look:
{% highlight c linenos %}
#define TERMINAL_BUFFER_SIZE 64U

static const uart_instance_t uart_terminal = UART_INSTANCE_USART2;

static uint8_t uart_terminal_rx_buffer[TERMINAL_BUFFER_SIZE];

static int init_uart_terminal_hw(void)
{
    const uart_config_t config = {
        .baudrate   = UART_BAUD_115200,
        .data_width = UART_DATA_8BIT,
        .parity     = UART_PARITY_NONE,
        .stop_bits  = UART_STOP_1BIT,
        .mode       = UART_MODE_TX_RX,
    };

    const uart_rx_buffer_t rx_buffer = {
        .buffer = uart_terminal_rx_buffer,
        .size   = TERMINAL_BUFFER_SIZE,
    };

    if (uart_init(uart_terminal, &config, &rx_buffer) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}

Something worth noting when using **uart_init**: the `config` struct and the `rx_buffer` wrapper can both be declared on the stack, since `uart_init` only reads them during the call. The RX storage array itself, however, cannot be a stack local. The driver keeps using that memory on every incoming byte for as long as the UART instance is initialized, so it needs to be declared where it can have a lifetime that outlives the init function (like a global variable or a static variable).
{% highlight c linenos %}
/**
 * @brief Transmit a buffer of bytes.
 *
 * Calls the internal TX helper for each byte. Fails early if any byte
 * times out waiting for the transmit register to empty.
 *
 * @param instance UART peripheral to write to
 * @param data     Pointer to transmit buffer
 * @param length   Number of bytes to transmit
 * @return STATUS_OK on success, STATUS_ERR_INVALID_ARG on bad arguments,
 *         STATUS_ERR_NOT_INIT if not initialised, STATUS_ERR_INVALID_STATE if
 *         the instance is not in a TX-capable mode, STATUS_ERR_TIMEOUT if a
 *         byte timed out waiting for the transmit register to empty.
 */
status_t uart_write_buffer(uart_instance_t instance, const uint8_t *data, uint16_t length);
{% endhighlight %}

**uart_write_buffer**: This is the function that is used to transmit characters on the UART TX line. It is used as follows:

Again, say you want to transmit data onto a terminal using your terminal module, you would use the **uart_write_buffer** function like this:
{% highlight c linenos %}
static int terminal_send_greeting(void)
{
    const uint8_t message[] = "Hello from mcu-co\r\n";

    /* sizeof - 1 to drop the trailing NUL terminator */
    if (uart_write_buffer(uart_terminal, message, sizeof(message) - 1U) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}

The driver also provides a function with more granularity if one wants to transmit single bytes on the TX line: **uart_write_byte**.

{% highlight c linenos %}
/**
 * @brief Transmit a single byte.
 *
 * Blocks until the transmit data register is empty, then writes the byte.
 *
 * @param instance UART peripheral to write to
 * @param data     Byte to transmit
 * @return STATUS_OK on success, STATUS_ERR_INVALID_ARG on an invalid instance,
 *         STATUS_ERR_NOT_INIT if not initialised, STATUS_ERR_INVALID_STATE if
 *         the instance is not in a TX-capable mode, STATUS_ERR_TIMEOUT if the
 *         transmit register did not empty in time.
 */
status_t uart_write_byte(uart_instance_t instance, const uint8_t data);
{% endhighlight %}

**uart_write_byte**: This function is used to transmit single bytes over the UART TX line. It can be used as follows:

Say you want your UART terminal to print out a payload that follows a specific structure. You can use **uart_write_byte** for finer control of the characters in the message:
{% highlight c linenos %}
#define FRAME_START 0x7EU
#define FRAME_END   0x7FU

/*
 * Send a structured log frame:
 *
 *   [START][LENGTH][ ...payload... ][CHECKSUM][END]
 *
 * The START, LENGTH, CHECKSUM and END bytes are computed here rather than
 * stored anywhere, so uart_write_byte lets us emit them around the payload
 * one at a time instead of building a separate contiguous buffer.
 */
static int terminal_send_log_frame(const uint8_t *payload, uint8_t length)
{
    uint8_t checksum = 0U;

    if (uart_write_byte(uart_terminal, FRAME_START) != STATUS_OK) {
        return -1;
    }

    if (uart_write_byte(uart_terminal, length) != STATUS_OK) {
        return -1;
    }

    for (uint8_t i = 0U; i < length; i++) {
        if (uart_write_byte(uart_terminal, payload[i]) != STATUS_OK) {
            return -1;
        }
        checksum ^= payload[i];
    }

    if (uart_write_byte(uart_terminal, checksum) != STATUS_OK) {
        return -1;
    }

    if (uart_write_byte(uart_terminal, FRAME_END) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}


{% highlight c linenos %}
/**
 * @brief Read available bytes from the RX ring buffer.
 *
 * Drains the ring buffer up to @p length bytes. Stops early if the buffer
 * empties before @p length is reached; draining an empty buffer is not an
 * error and yields @p bytes_read == 0 with STATUS_OK.
 *
 * @param instance   UART peripheral to read from
 * @param data       Output buffer to write received bytes into
 * @param length     Maximum number of bytes to read
 * @param bytes_read Output parameter set to the number of bytes read (0 to length)
 * @return STATUS_OK on success, STATUS_ERR_INVALID_ARG on bad arguments,
 *         STATUS_ERR_NOT_INIT if not initialised, STATUS_ERR_INVALID_STATE if
 *         the instance is not in an RX-capable mode.
 */
status_t uart_read_buffer(uart_instance_t instance, uint8_t *data, uint16_t length,
                          uint16_t *bytes_read);
{% endhighlight %}
**uart_read_buffer**: This function reads multiple bytes stored in the RX ring buffer and places them in an output buffer the user provides. The ring buffer serves as temporary storage for the bytes held in the UART peripheral's shift register. The driver has an interrupt service routine that fires every time our enabled UART peripheral has data in its shift register. That data is then stored in the ring buffer, where it is ready to be consumed by the **uart_read_buffer** function. 

An example use case using this function is as follows:

{% highlight c linenos %}
/* Pull whatever the terminal has sent us into a local buffer. */
static int terminal_read_command(uint8_t *dst, uint16_t max_len, uint16_t *received)
{
    if (uart_read_buffer(uart_terminal, dst, max_len, received) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}

This function also serves as a burst read: it drains as many bytes from the ring buffer as are available, up to the maximum length of the output buffer.

If you need finer control, for an application like a state machine where you want to transition states based on the byte you receive, you're better off using **uart_read_byte**, as detailed below.

{% highlight c linenos %}
/**
 * @brief Read a single byte from the RX ring buffer.
 *
 * Returns immediately if no byte is available.
 *
 * @param instance UART peripheral to read from
 * @param data     Output parameter for the received byte
 * @return STATUS_OK on success, STATUS_ERR_EMPTY if no byte is available,
 *         STATUS_ERR_INVALID_ARG on bad arguments, STATUS_ERR_NOT_INIT if not
 *         initialised, STATUS_ERR_INVALID_STATE if not in an RX-capable mode.
 */
status_t uart_read_byte(uart_instance_t instance, uint8_t *data);
{% endhighlight %}
**uart_read_byte**: This function is used to pop a single byte from the RX ring buffer, and it provides the user with more precise control, as seen in the example below:

Below we have a state machine that is used to parse an incoming payload. We want to read one byte at a time, since each byte determines what state we transition to while parsing the payload.
{% highlight c linenos %}
/*
 * Receive-side counterpart to the framed log sender. We pull one byte at a
 * time and feed it into a small state machine, which lets us parse the frame
 * as it streams in without buffering the whole thing first.
 *
 *   [START][LENGTH][ ...payload... ][CHECKSUM][END]
 */
typedef enum {
    FRAME_WAIT_START,
    FRAME_WAIT_LENGTH,
    FRAME_READ_PAYLOAD,
    FRAME_WAIT_CHECKSUM,
} frame_state_t;

/* Returns 1 when a full, valid frame has been assembled into dst. */
static int terminal_poll_frame(uint8_t *dst, uint8_t *out_len)
{
    static frame_state_t state = FRAME_WAIT_START;
    static uint8_t expected_len;
    static uint8_t index;
    static uint8_t checksum;

    uint8_t byte;

    /* Nothing in the ring buffer yet - come back and try again later. */
    if (uart_read_byte(uart_terminal, &byte) != STATUS_OK) {
        return 0;
    }

    switch (state) {
    case FRAME_WAIT_START:
        if (byte == FRAME_START) {
            state = FRAME_WAIT_LENGTH;
        }
        break;

    case FRAME_WAIT_LENGTH:
        expected_len = byte;
        index    = 0U;
        checksum = 0U;
        state    = (expected_len > 0U) ? FRAME_READ_PAYLOAD : FRAME_WAIT_CHECKSUM;
        break;

    case FRAME_READ_PAYLOAD:
        dst[index++] = byte;
        checksum    ^= byte;
        if (index == expected_len) {
            state = FRAME_WAIT_CHECKSUM;
        }
        break;

    case FRAME_WAIT_CHECKSUM:
        state = FRAME_WAIT_START;
        if (byte == checksum) {
            *out_len = expected_len;
            return 1;
        }
        break;
    }

    return 0;
}
{% endhighlight %}


{% highlight c linenos %}
/**
 * @brief Deinitialise a UART peripheral.
 *
 * Waits for any in-progress transmission to complete, disables the
 * peripheral and its clock, deconfigures GPIO pins, and disables the
 * NVIC interrupt if RX was active.
 *
 * @param instance UART peripheral to deinitialise
 * @return STATUS_OK on success, STATUS_ERR_INVALID_ARG on an invalid instance,
 *         STATUS_ERR_NOT_INIT if the peripheral was not initialised.
 */
status_t uart_deinit(uart_instance_t instance);
{% endhighlight %}
**uart_deinit**: This function is used to deinitialize the UART channel in use. It disables the clock for the specific UART bus and marks its state as uninitialized in the driver. It can be used as follows:

{% highlight c linenos %}
static int shutdown_uart_terminal(void)
{
    if (uart_deinit(uart_terminal) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}

## General Trends

Each function above returns a status to let the user know whether the operation was successful or not. Also, when a function fails, it returns a different status code, giving the user a better idea of what caused the failure, which is great for debugging purposes. Below is the status enumeration and the different status values the functions can return:
{% highlight c linenos %}
typedef enum {
    STATUS_OK = 0,            /**< Operation completed successfully.            */
    STATUS_ERR_INVALID_ARG,   /**< NULL pointer or out-of-range enum argument.  */
    STATUS_ERR_INVALID_PIN,   /**< Pin number out of range or a reserved pin.   */
    STATUS_ERR_INVALID_STATE, /**< Resource not configured for this operation.  */
    STATUS_ERR_NOT_INIT,      /**< Peripheral or clock not initialised yet.     */
    STATUS_ERR_BUSY,          /**< Resource already initialised or in use.      */
    STATUS_ERR_TIMEOUT,       /**< Hardware did not respond within the timeout. */
    STATUS_ERR_UNSUPPORTED,   /**< Valid request the driver cannot satisfy.     */
    STATUS_ERR_EMPTY,         /**< No data available (e.g. RX buffer empty).    */
} status_t;


{% endhighlight %}