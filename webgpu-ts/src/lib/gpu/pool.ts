export type GPUIndex = number;

export class GPUPool {
  device: GPUDevice;
  buffer: GPUBuffer;
  blockSize: number; // bytes
  length: number;
  freeIndices: Set<GPUIndex>;
  constructor(device: GPUDevice, args: { blockSize: number, buffer: GPUBuffer; }) {
    this.device = device;
    this.buffer = args.buffer;
    this.blockSize = args.blockSize;
    this.length = 0;
    this.freeIndices = new Set();
  }

  clear() {
    this.length = 0;
    this.freeIndices.clear();
  }

  alloc(): GPUIndex {
    let index = this.freeIndices.values().next().value;
    if (index !== undefined) {
      this.freeIndices.delete(index);
      return index;
    }
    index = this.length;
    this.length += 1;
    if (this.length * this.blockSize > this.buffer.size) {
      throw new Error('GPUPool: could not allocate, out of memory.');
    }
    return index;
  }

  free(i: GPUIndex) {
    this.freeIndices.add(i);
    this.length = Math.max(0, this.length - 1);
  }

  write(i: GPUIndex, data: GPUAllowSharedBufferSource) {
    const offset = i * this.blockSize;
    this.device.queue.writeBuffer(this.buffer, offset, data);
  }
}