export interface GPUArenaSlot {
  offset: number;
  size: number;
}
export class GPUArena<k, a> {
  readonly NULL: number;
  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
  readonly maxSize: number;
  readonly serialize: (value: a) => BufferSource;
  allocations: Map<k, GPUArenaSlot>;
  freeList: GPUArenaSlot[];
  constructor(args: {
    device: GPUDevice;
    label?: string;
    maxSize: number;
    usage: number;
    serialize: (value: a) => BufferSource;
    NULL?: number;
  }) {
    this.NULL = args.NULL ?? 0xffffffff;
    this.device = args.device;
    this.buffer = this.device.createBuffer({
      label: args.label,
      size: args.maxSize,
      usage: args.usage,
    });
    this.maxSize = args.maxSize;
    this.serialize = args.serialize;
    this.allocations = new Map();
    this.freeList = [{ offset: 0, size: this.maxSize }];
  }

  clear() {
    this.allocations.clear();
    this.freeList = [{ offset: 0, size: this.maxSize }];
  }

  get(key: k): GPUArenaSlot | undefined {
    return this.allocations.get(key);
  }

  stream(key: k, value: a): GPUArenaSlot {
    const slot = this.allocations.get(key);
    if (slot !== undefined) {
      return slot;
    }
    return this.add(key, value);
  }

  add(key: k, value: a): GPUArenaSlot {
    const data = this.serialize(value);
    const slot = this.findFreeSlot(data.byteLength);
    if (slot === undefined) {
      return { offset: this.NULL, size: 0 };
    }
    this.allocations.set(key, slot);
    this.device.queue.writeBuffer(this.buffer, slot.offset, data);
    return slot;
  }

  remove(key: k): GPUArenaSlot | undefined {
    throw new Error("TODO: GPUArena.remove");
  }

  // TODO: Optimize this
  // - make sure freeList is always sorted
  // - find with binary search
  // - when inserting a free slot, check if it can be merged
  findFreeSlot(size: number): GPUArenaSlot | undefined {
    for (const [slotIndex, slot] of this.freeList.entries()) {
      if (slot.size >= size) {
        if (slot.size > size) {
          // Create a smaller free entry for the remainder.
          this.freeList.push({
            offset: slot.offset + size,
            size: slot.size - size,
          });
        }
        // Delete the entry from the free list we just used.
        this.freeList.splice(slotIndex, 1);
        return { offset: slot.offset, size };
      }
    }
    return undefined;
  }
}
