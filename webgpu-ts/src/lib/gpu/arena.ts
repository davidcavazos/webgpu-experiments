export interface GPUArenaSlot {
  offset: number;
  size: number;
}
export class GPUArena<k, v> {
  readonly NULL: number;
  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
  readonly maxSize: number;
  readonly serialize: (value: v) => BufferSource;
  allocations: Map<k, GPUArenaSlot>;
  freeList: GPUArenaSlot[];
  constructor(
    device: GPUDevice,
    args: {
      label?: string;
      size: number;
      usage: number;
      serialize: (value: v) => BufferSource;
      NULL?: number;
    },
  ) {
    this.NULL = args.NULL ?? 0xffffffff;
    this.device = device;
    this.buffer = this.device.createBuffer({
      label: args.label,
      size: args.size,
      usage: args.usage,
    });
    this.maxSize = args.size;
    this.serialize = args.serialize;
    this.allocations = new Map();
    this.freeList = [{ offset: 0, size: this.maxSize }];
  }

  clear() {
    this.allocations.clear();
    this.freeList = [{ offset: 0, size: this.maxSize }];
  }

  size(): number {
    return this.allocations.size;
  }
  keys(): MapIterator<k> {
    return this.allocations.keys();
  }
  values(): MapIterator<GPUArenaSlot> {
    return this.allocations.values();
  }
  entries(): MapIterator<[k, GPUArenaSlot]> {
    return this.allocations.entries();
  }

  get(key: k): GPUArenaSlot | undefined {
    return this.allocations.get(key);
  }

  add(key: k, value: v): GPUArenaSlot {
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
    for (const [i, slot] of this.freeList.entries()) {
      if (slot.size >= size) {
        if (slot.size > size) {
          // Create a smaller free entry for the remainder.
          this.freeList.push({
            offset: slot.offset + size,
            size: slot.size - size,
          });
        }
        // Delete the entry from the free list we just used.
        this.freeList.splice(i, 1);
        return { offset: slot.offset, size };
      }
    }
    return undefined;
  }
}
