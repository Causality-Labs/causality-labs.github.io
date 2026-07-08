---
layout: post
title: mcu-co How to write a type agnostic Ring Buffer (mcu-co P3)
date: 2026-06-14 09:40:16
description: How to write a type agnostic ring buffer in C, the ring buffer can be used for any data struct.
tags: MCU
categories: mcu-co
thumbnail: assets/img/blogs/mcu-co_Visual.png
---

## Introduction
Ring buffers are one of the most common data structures used in embedded software, I will be using ring buffers in multiple modules for the firmware in mcu-co, it will be used in my UART driver, logger module and possibly more. This post will go over how to write a type agnostic ring buffer, it will be type agnostic meaning one can store any type of data structure in the ring buffer. To learn the basics of how a ring buffer works you can do so here [website](https://en.wikipedia.org/wiki/Circular_buffer), as the scope of this post will only go over how to implement one via software.

## Data Structure

{% highlight c linenos %}
typedef struct {
    void *buffer;
    size_t element_size;
    uint16_t capacity;
    uint16_t head;
    uint16_t tail;
    uint16_t mask;
} ring_buffer_t;
{% endhighlight %}

**ring_buffer_t**: This is the data structure for the ring buffer, it contains the following members:
- **buffer**: A void pointer to the backing storage. It's `void` because the ring buffer is type agnostic, letting it be cast to whatever data type is actually being stored.
- **element_size**: This is the member that the user can use to tell us the size (in bytes) of the data structure that the ring buffer will be using.
- **capacity**: This is the member that tells us the total number of element slots the ring buffer has room for. It must be a power of two, which is what lets `mask` be used for index wraparound instead of a more expensive modulo operation.
- **head**: This is the index of the next free slot the ring buffer will write into. It's owned by the producer and gets advanced every time `ring_buffer_write` succeeds.
- **tail**: This is the index of the oldest slot the ring buffer will read from next. It's owned by the consumer and gets advanced every time `ring_buffer_read` succeeds.
- **mask**: This is `capacity - 1`, precomputed so that `head` and `tail` can be wrapped back into range with a cheap bitwise AND instead of a modulo, which only works because `capacity` is a power of two.

**Power of 2 rule**: Requiring `capacity` to be a power of two lets index wraparound be done with `index & mask` instead of `index % capacity`. Bitwise AND is a single fast instruction on almost any MCU, while modulo on a non-power-of-two involves a much slower division operation, so this trades a small restriction on buffer sizes for cheaper reads and writes.

{% highlight c linenos %}
status_t ring_buffer_init(ring_buffer_t *rb, void *buffer, uint16_t capacity, size_t element_size);
{% endhighlight %}
**ring_buffer_init**: This is the function used to initialize the ring buffer. When initializing the ring buffer, one must provide the API with a buffer, the capacity they want, and the size of the data structure the ring buffer should be created for. Below is the actual implementation of the initialization function:
{% highlight c linenos %}
status_t ring_buffer_init(ring_buffer_t *rb, void *buffer, uint16_t capacity, size_t element_size)
{
    if (rb == NULL || buffer == NULL) {
        return STATUS_ERR_INVALID_ARG;
    }

    if (element_size == 0U) {
        return STATUS_ERR_INVALID_ARG;
    }

    if ((capacity == 0U) || ((capacity & (capacity - 1U)) != 0U)) {
        return STATUS_ERR_INVALID_ARG;
    }

    rb->buffer       = buffer;
    rb->element_size = element_size;
    rb->capacity     = capacity;
    rb->head         = 0U;
    rb->tail         = 0U;
    rb->mask         = (uint16_t)(capacity - 1U);

    return STATUS_OK;
}
{% endhighlight %}

Fairly simple function that checks to see if all the inputs are valid and copies all the necessary members into the struct.

Here is how the function can be used below:
{% highlight c linenos %}
#define SENSOR_LOG_CAPACITY 16U

typedef struct {
    uint32_t timestamp_ms;
    int16_t  temperature_c;
} sensor_sample_t;

static ring_buffer_t   sensor_log_rb;
static sensor_sample_t sensor_log_storage[SENSOR_LOG_CAPACITY];

static int init_sensor_log(void)
{
    if (ring_buffer_init(&sensor_log_rb, sensor_log_storage, SENSOR_LOG_CAPACITY,
                          sizeof(sensor_sample_t)) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}

This example stores `sensor_sample_t` structs rather than raw bytes, which is the point of making the ring buffer type agnostic: the same `ring_buffer_init`/`ring_buffer_write`/`ring_buffer_read` functions work regardless of what `element_size` you initialize it with.

{% highlight c linenos %}
status_t ring_buffer_write(ring_buffer_t *rb, const void *element);
{% endhighlight %}
**ring_buffer_write**: This API is used to add new elements to the ring buffer and updating the head member to point to the next available spot. Below is the implementation:
{% highlight c linenos %}
status_t ring_buffer_write(ring_buffer_t *rb, const void *element)
{
    if (rb == NULL || element == NULL) {
        return STATUS_ERR_INVALID_ARG;
    }

    uint8_t *dst = (uint8_t *)rb->buffer + (rb->head * rb->element_size);
    (void)memcpy(dst, element, rb->element_size);
    rb->head = (uint16_t)((rb->head + 1U) & rb->mask);

    return STATUS_OK;
}
{% endhighlight %}
As you can see above the implementation of the **ring_buffer_write()** is fairly simple, we first check to see if any of the input elements are NULL, then we calculate the destination address we want to store our new element, with the equation :
```
dst = buffer + (head * element_size)
```
`buffer` is the base address of the backing storage, and `head * element_size` is the byte offset of the next free slot, since each slot is `element_size` bytes wide. Adding that offset to the base address gives us the exact address we want to store our element in.

We then use `memcpy`, a C standard library function that copies a block of raw bytes from one memory address to another. We use it here because it lets us copy an element of any size into the ring buffer, regardless of its type.

The last step is to increment `head`, wrapping it back to 0 once it reaches `capacity`. The naive way to do this is `head = (head + 1) % capacity`, but since `capacity` is a power of two, `(head + 1) & mask` gives the exact same result: once `head + 1` reaches `capacity`, ANDing it with `mask` (`capacity - 1`) clears the bit that would have made it equal to `capacity`, snapping it back down to 0. Same wraparound behavior as modulo, just with a single fast bitwise AND instead of a slower division.

For example, with a `capacity` of 8 (`mask = 0b0111`), incrementing `head` from 7 wraps it back to 0:

{% highlight c linenos %}
head + 1 = 0b1000 (8)
mask     = 0b0111 (7)
-----------------------
result   = 0b0000 (0)
{% endhighlight %}

Any `head` value less than `capacity` is left untouched by the mask, since none of its bits extend past `mask`. For example, `head + 1 = 3` (`0b0011`) ANDed with `mask` (`0b0111`) is still `0b0011`, i.e. 3.

Here is how the function can be used below, continuing with the `sensor_log_rb` example from earlier:
{% highlight c linenos %}
static int sensor_log_record(uint32_t timestamp_ms, int16_t temperature_c)
{
    const sensor_sample_t sample = {
        .timestamp_ms  = timestamp_ms,
        .temperature_c = temperature_c,
    };

    if (ring_buffer_write(&sensor_log_rb, &sample) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}

{% highlight c linenos %}
status_t ring_buffer_read(ring_buffer_t *rb, void *element);
{% endhighlight %}
**ring_buffer_read**: This API allows the user to read elements from the ring buffer and pop them off it. It pops the element off by moving the tail pointer to the next element.
{% highlight c linenos %}
status_t ring_buffer_read(ring_buffer_t *rb, void *element)
{
    if (rb == NULL || element == NULL) {
        return STATUS_ERR_INVALID_ARG;
    }

    if (ring_buffer_is_empty(rb)) {
        return STATUS_ERR_EMPTY;
    }

    const uint8_t *src = (const uint8_t *)rb->buffer + (rb->tail * rb->element_size);
    (void)memcpy(element, src, rb->element_size);
    rb->tail = (uint16_t)((rb->tail + 1U) & rb->mask);

    return STATUS_OK;
}
{% endhighlight %}
From the implementation of `ring_buffer_read` you can see it mirrors `ring_buffer_write` almost exactly, just from the opposite end of the buffer: instead of computing a destination address from `head`, it computes a source address from `tail` using the same `buffer + (tail * element_size)` formula, `memcpy`s that slot's bytes out into the caller's `element` pointer, and then advances `tail` with the same `(tail + 1) & mask` wraparound. The one addition is the `ring_buffer_is_empty` check up front, since there is nothing to read once `tail` has caught up to `head`.

Here is how the function can be used below, continuing with the `sensor_log_rb` example from earlier:
{% highlight c linenos %}
static int sensor_log_playback(sensor_sample_t *out_sample)
{
    if (ring_buffer_read(&sensor_log_rb, out_sample) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}

{% highlight c linenos %}
bool ring_buffer_is_empty(const ring_buffer_t *rb);
{% endhighlight %}
**ring_buffer_is_empty**: This API tells the caller whether the ring buffer currently holds any elements. Below is the implementation:
{% highlight c linenos %}
bool ring_buffer_is_empty(const ring_buffer_t *rb)
{
    if (rb == NULL) {
        return false;
    }

    return rb->head == rb->tail;
}
{% endhighlight %}
The buffer is empty exactly when `head` and `tail` point at the same slot, since that means every element the producer has ever written has already been read back out by the consumer.

Here is how the function can be used below, continuing with the `sensor_log_rb` example from earlier:
{% highlight c linenos %}
static void sensor_log_drain_all(void)
{
    sensor_sample_t sample;

    while (!ring_buffer_is_empty(&sensor_log_rb)) {
        if (ring_buffer_read(&sensor_log_rb, &sample) != STATUS_OK) {
            break;
        }

        /* Do something with sample, e.g. print it over UART. */
    }
}
{% endhighlight %}

{% highlight c linenos %}
bool ring_buffer_is_full(const ring_buffer_t *rb);
{% endhighlight %}
**ring_buffer_is_full**: This API tells the caller whether the ring buffer has room for another element. Below is the implementation:
{% highlight c linenos %}
bool ring_buffer_is_full(const ring_buffer_t *rb)
{
    if (rb == NULL) {
        return false;
    }

    return ((rb->head + 1U) & rb->mask) == rb->tail;
}
{% endhighlight %}
Rather than comparing `head` directly to `tail`, this checks whether *one more write* would make `head` collide with `tail`. That's the one reserved slot mentioned earlier in the `ring_buffer_t` struct comment: without it, a full buffer and an empty buffer would both look like `head == tail`, and there would be no way to tell them apart.

Here is how the function can be used below, continuing with the `sensor_log_rb` example from earlier:
{% highlight c linenos %}
static int sensor_log_record_safe(uint32_t timestamp_ms, int16_t temperature_c)
{
    if (ring_buffer_is_full(&sensor_log_rb)) {
        return -1;
    }

    return sensor_log_record(timestamp_ms, temperature_c);
}
{% endhighlight %}

{% highlight c linenos %}
status_t ring_buffer_flush(ring_buffer_t *rb);
{% endhighlight %}
**ring_buffer_flush**: This API discards any buffered elements without touching the backing storage itself. Below is the implementation:
{% highlight c linenos %}
status_t ring_buffer_flush(ring_buffer_t *rb)
{
    if (rb == NULL) {
        return STATUS_ERR_INVALID_ARG;
    }

    rb->head = 0U;
    rb->tail = 0U;

    return STATUS_OK;
}
{% endhighlight %}
Since `ring_buffer_is_empty` only looks at `head` and `tail`, simply resetting both back to 0 is enough to make the buffer report itself as empty again; the stale bytes left behind in `buffer` are never read because nothing can reach them until they're overwritten by a future `ring_buffer_write`.

Here is how the function can be used below, continuing with the `sensor_log_rb` example from earlier:
{% highlight c linenos %}
static int sensor_log_reset(void)
{
    if (ring_buffer_flush(&sensor_log_rb) != STATUS_OK) {
        return -1;
    }

    return 0;
}
{% endhighlight %}
