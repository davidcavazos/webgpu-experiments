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

export type BufferType = "uint8" | "uint16" | "uint32" | "float32";

export type ChunkID = number;

export interface BufferSlot {
  chunk: ChunkID;
  offset: number;
  size: number;
  type: BufferType;
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
            offset: slot.offset + size,
            size: slot.size - size,
            type: "uint8",
          });
        }
        // Delete the entry from the free list we just used.
        this.freeList.splice(slotID, 1);
        return slot;
      }
    }
    // No available free slots, allocate a new chunk.
    const chunk = this.chunks.length;
    this.freeList.push({
      chunk,
      offset: size,
      size: this.chunkSize - size,
      type: "uint8",
    });
    const chunkBuffer = this.device.createBuffer({
      label: `[${chunk}] ${this.label}`,
      size: this.chunkSize,
      usage: this.usage,
    });
    this.chunks.push(chunkBuffer);
    console.log(
      `[${this.label}] allocated new chunk (chunks=${this.chunks.length})`,
    );
    return { chunk, offset: 0, size, type: "uint8" };
  }

  writeFloat32(data: number[]): BufferSlot {
    return this.#write("float32", data, (xs) => new Float32Array(xs));
  }

  writeUInt8(data: number[]): BufferSlot {
    // WebGPU requires buffer writes to be a multiple of 4.
    const padding = new Array(4 - (data.length % 4)).fill(0);
    return this.#write(
      "uint8",
      data.concat(padding),
      (xs) => new Uint8Array(xs),
    );
  }

  writeUInt16(data: number[]): BufferSlot {
    // WebGPU requires buffer writes to be a multiple of 4.
    const padding = new Array(data.length % 2).fill(0);
    return this.#write(
      "uint16",
      data.concat(padding),
      (xs) => new Uint16Array(xs),
    );
  }

  writeUInt32(data: number[]): BufferSlot {
    return this.#write("uint32", data, (xs) => new Uint32Array(xs));
  }

  #write(
    type: BufferType,
    data: number[],
    toBuffer: (xs: number[]) => BufferSource,
  ): BufferSlot {
    const buffer = toBuffer(data);
    const slot = this.findFreeSlot(buffer.byteLength);
    this.device.queue.writeBuffer(
      this.chunks[slot.chunk]!,
      slot.offset,
      buffer,
    );
    return { ...slot, type };
  }
}
