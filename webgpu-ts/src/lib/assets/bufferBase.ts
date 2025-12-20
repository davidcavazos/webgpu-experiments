// class BufferChunk {
//   buffer: GPUBuffer;

//   constructor(device: GPUDevice, label: string, usage: number, size?: number) {
//     this.buffer = device.createBuffer({
//       label,
//       size: size ? size : device.limits.maxBufferSize,
//       usage,
//     });
//   }
// }

export type ChunkID = number;

export interface BufferSlot {
  chunk: ChunkID;
  buffer: GPUBuffer;
  offset: number;
  size: number;
}

export class BufferBase {
  readonly device: GPUDevice;
  readonly label: string;
  readonly usage: number;
  readonly chunkSize: number; // bytes
  chunks: GPUBuffer[];
  freeList: BufferSlot[];
  // TODO: to support free, will need LRU
  // leastRecentlyUsed = new LeastRecentlyUsed();

  constructor(
    device: GPUDevice,
    label: string,
    usage: number,
    chunkSize?: number,
  ) {
    this.device = device;
    this.label = label;
    this.usage = usage;
    this.chunkSize = chunkSize ?? device.limits.maxBufferSize;
    this.chunks = [];
    this.freeList = [];
  }

  clear() {
    this.freeList = this.chunks.map(
      (buffer, chunkID): BufferSlot => ({
        chunk: chunkID,
        buffer,
        offset: 0,
        size: this.chunkSize,
      }),
    );
  }

  // TODO: Optimize this
  // - make sure freeList is always sorted
  // - find with binary search
  // - when inserting a free slot, check if it can be merged
  findFreeSlot(size: number): BufferSlot {
    for (const [slotID, slot] of this.freeList.entries()) {
      if (slot.size >= size) {
        if (slot.size > size) {
          // Create a smaller free entry for the remainder.
          this.freeList.push({
            chunk: slot.chunk,
            buffer: slot.buffer,
            offset: slot.offset + size,
            size: slot.size - size,
          });
        }
        // Delete the entry from the free list we just used.
        this.freeList.splice(slotID, 1);
        return {
          chunk: slot.chunk,
          buffer: slot.buffer,
          offset: slot.offset,
          size,
        };
      }
    }
    // No available free slots, allocate a new chunk.
    const chunk = this.chunks.length;
    const buffer = this.device.createBuffer({
      label: `[${chunk}] ${this.label}`,
      size: this.chunkSize,
      usage: this.usage,
    });
    this.freeList.push({
      chunk,
      buffer,
      offset: size,
      size: this.chunkSize - size,
    });
    this.chunks.push(buffer);
    // console.log(
    //   `[${this.label}] allocated new chunk (chunks=${this.chunks.length})`,
    // );
    return { chunk, buffer, offset: 0, size };
  }

  writeFloat32(data: number[]): BufferSlot {
    return this.#write(new Float32Array(data));
  }

  writeUInt8(data: number[]): BufferSlot {
    // WebGPU requires buffer writes to be a multiple of 4.
    const padding = new Array(4 - (data.length % 4)).fill(0);
    return this.#write(new Uint8Array(data.concat(padding)));
  }

  writeUInt16(data: number[]): BufferSlot {
    // WebGPU requires buffer writes to be a multiple of 4.
    const padding = new Array(data.length % 2).fill(0);
    return this.#write(new Uint16Array(data.concat(padding)));
  }

  writeUInt32(data: number[]): BufferSlot {
    return this.#write(new Uint32Array(data));
  }

  #write(data: BufferSource): BufferSlot {
    const slot = this.findFreeSlot(data.byteLength);
    this.device.queue.writeBuffer(this.chunks[slot.chunk]!, slot.offset, data);
    return slot;
  }
}
