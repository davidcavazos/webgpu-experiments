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

  write(slot: GPUHeapSlot, serialize: (block: ArrayBuffer) => void) {
    const block = this.buffer.getMappedRange(slot.offset, slot.size);
    serialize(block);
    this.device.queue.writeBuffer(this.buffer, slot.offset, block);
  }
}