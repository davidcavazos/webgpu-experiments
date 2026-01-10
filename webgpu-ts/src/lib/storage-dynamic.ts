export interface StorageDynamicSlot {
  offset: number;
  size: number;
}
export class StorageDynamic<k, v> {
  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
  readonly maxSize: number;
  readonly sizeOf: (value: v) => number;
  offsets: Map<k, number>;
  values: Map<number, v>;
  freeList: StorageDynamicSlot[];
  constructor(args: {
    device: GPUDevice;
    label?: string;
    maxSize: number;
    usage: number;
    sizeOf: (value: v) => number;
  }) {
    this.device = args.device;
    this.buffer = this.device.createBuffer({
      label: args.label,
      size: args.maxSize,
      usage: args.usage,
    });
    this.maxSize = args.maxSize;
    this.sizeOf = args.sizeOf;
    this.offsets = new Map();
    this.values = new Map();
    this.freeList = [{ offset: 0, size: this.maxSize }];
  }

  clear() {
    this.offsets.clear();
    this.values.clear();
    this.freeList = [{ offset: 0, size: this.maxSize }];
  }

  // TODO: Optimize this
  // - make sure freeList is always sorted
  // - find with binary search
  // - when inserting a free slot, check if it can be merged
  findFreeSlot(size: number): StorageDynamicSlot | undefined {
    for (const [slotID, slot] of this.freeList.entries()) {
      if (slot.size >= size) {
        if (slot.size > size) {
          // Create a smaller free entry for the remainder.
          this.freeList.push({
            offset: slot.offset + size,
            size: slot.size - size,
          });
        }
        // Delete the entry from the free list we just used.
        this.freeList.splice(slotID, 1);
        return { offset: slot.offset, size };
      }
    }
    return undefined;
  }

  add(key: k, value: v): StorageDynamicSlot {
    const slot = this.findFreeSlot(this.sizeOf(value));
    if (slot === undefined) {
      return { offset: 0xffff, size: 0 };
    }
    this.offsets.set(key, slot.offset);
    this.values.set(slot.offset, value);
    return slot;
  }
}
