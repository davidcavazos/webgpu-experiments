export type GPUStoreIndex = number;
export class GPUStore<k, v> {
  readonly NULL: number;
  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
  readonly maxSize: number;
  readonly stride: number;
  readonly serialize: (value: v, dst: ArrayBufferLike) => void;
  allocations: Map<k, GPUStoreIndex>;
  freeList: GPUStoreIndex[];
  constructor(
    device: GPUDevice,
    args: {
      label?: string;
      size: number;
      usage: number;
      stride: number;
      serialize: (value: v, dst: ArrayBufferLike) => void;
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
    this.stride = args.stride;
    this.serialize = args.serialize;
    this.allocations = new Map();
    this.freeList = [];
  }

  clear() {
    this.allocations.clear();
    this.freeList = [];
  }

  size(): number {
    return this.allocations.size;
  }
  keys(): MapIterator<k> {
    return this.allocations.keys();
  }
  values(): MapIterator<number> {
    return this.allocations.values();
  }
  entries(): MapIterator<[k, GPUStoreIndex]> {
    return this.allocations.entries();
  }

  get(key: k): GPUStoreIndex | undefined {
    return this.allocations.get(key);
  }

  add(key: k, value: v): GPUStoreIndex {
    const index = this.findFreeIndex();
    if (index === undefined) {
      return this.NULL;
    }
    this.allocations.set(key, index);
    const data = new ArrayBuffer(this.stride);
    this.serialize(value, data);
    const offset = index * this.stride;
    this.device.queue.writeBuffer(this.buffer, offset, data);
    return index;
  }

  remove(key: k): GPUStoreIndex | undefined {
    throw new Error("TODO: GPUStore.remove");
  }

  findFreeIndex(): GPUStoreIndex | undefined {
    const index = this.freeList.pop();
    if (index !== undefined) {
      return index;
    }
    return this.allocations.size;
  }
}
