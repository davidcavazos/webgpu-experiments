export interface GPUHeapSlot {
  offset: number;
  size: number; // bytes
}

export class GPUHeap {
  device: GPUDevice;
  buffer: GPUBuffer;
  _size: number; // TODO: replace with actual allocator
  constructor(device: GPUDevice, args: { buffer: GPUBuffer; }) {
    this.device = device;
    this.buffer = args.buffer;
    this._size = 0;
  }

  size_capacity(): number {
    return this.buffer.size;
  }
  size_used(): number {
    return this._size;
  }
  size_available(): number {
    return this.size_capacity() - this.size_used();
  }

  clear() {
    this._size = 0;
  }

  alloc(size: number): GPUHeapSlot {
    // TODO: TLSF (Two-Level Segregated Fit) allocator
    const slot = { offset: this._size, size };
    this._size += size;
    if (this._size > this.buffer.size) {
      throw new Error('GPUHeap: could not allocate, out of memory.');
    }
    return slot;
  }

  free(slot: GPUHeapSlot) {
    throw new Error("TODO: GPUHeap.free not implemented yet");
  }

  write(offset: number, data: GPUAllowSharedBufferSource) {
    this.device.queue.writeBuffer(this.buffer, offset, data);
  }
}