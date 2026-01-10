export type GPUStoreIndex = number;
export class GPUStore<k, a> {
  readonly NULL: number;
  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
  readonly maxSize: number;
  readonly stride: number;
  readonly serialize: (value: a, dst: ArrayBufferLike) => void;
  allocations: Map<k, GPUStoreIndex>;
  freeList: GPUStoreIndex[];
  constructor(args: {
    device: GPUDevice;
    label?: string;
    maxSize: number;
    usage: number;
    stride: number;
    serialize: (value: a, dst: ArrayBufferLike) => void;
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
    this.stride = args.stride;
    this.serialize = args.serialize;
    this.allocations = new Map();
    this.freeList = [];
  }

  clear() {
    this.allocations.clear();
    this.freeList = [];
  }

  get(key: k): GPUStoreIndex | undefined {
    return this.allocations.get(key);
  }

  add(key: k, value: a): GPUStoreIndex {
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
