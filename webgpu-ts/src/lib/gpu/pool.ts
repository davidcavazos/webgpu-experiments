export type GPUIndex = number;

export class GPUPool {
  device: GPUDevice;
  buffer: GPUBuffer;
  blockSize: number; // bytes
  size: number;
  freeIndices: Set<GPUIndex>;
  constructor(device: GPUDevice, args: { blockSize: number, buffer: GPUBuffer; }) {
    this.device = device;
    this.buffer = args.buffer;
    this.blockSize = args.blockSize;
    this.size = 0;
    this.freeIndices = new Set();
  }

  clear() {
    this.size = 0;
    this.freeIndices.clear();
  }

  allocate(): GPUIndex {
    let index = this.freeIndices.values().next().value;
    if (index !== undefined) {
      this.freeIndices.delete(index);
      return index;
    }
    index = this.size;
    this.size += 1;
    if (this.size * this.blockSize > this.buffer.size) {
      throw new Error('GPUPool: could not allocate, out of memory.');
    }
    return index;
  }

  free(i: GPUIndex) {
    if (i === this.size - 1) {
      this.size -= 1;
      // TODO: improve fragmentation of free indices.
      if (this.size === 0) {
        this.freeIndices.clear();
      }
    } else {
      this.freeIndices.add(i);
    }
  }

  write(i: GPUIndex, data: GPUAllowSharedBufferSource) {
    const offset = i * this.blockSize;
    this.device.queue.writeBuffer(this.buffer, offset, data);
  }
}