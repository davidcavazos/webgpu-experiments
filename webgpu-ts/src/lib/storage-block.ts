export class StorageBlock<k, v> {
  readonly device: GPUDevice;
  readonly label: string;
  readonly buffer: GPUBuffer;
  readonly maxSize: number;
  readonly stride: number;
  readonly serialize: (
    dst: ArrayBuffer,
    entries: { value: v; offset: number }[],
  ) => number;
  indices: Map<k, number>;
  values: v[];
  freeList: number[];
  constructor(args: {
    device: GPUDevice;
    label: string;
    maxSize: number;
    usage: number;
    stride: number;
    serialize: (
      dst: ArrayBuffer,
      entries: { value: v; offset: number }[],
    ) => number;
  }) {
    this.device = args.device;
    this.label = args.label;
    this.buffer = this.device.createBuffer({
      label: args.label,
      size: args.maxSize,
      usage: args.usage,
    });
    this.maxSize = args.maxSize;
    this.stride = args.stride;
    this.serialize = args.serialize;
    this.indices = new Map();
    this.values = [];
    this.freeList = [];
  }

  clear() {
    this.indices.clear();
    this.values = [];
    this.freeList = [];
  }

  set(entries: [k, v][]): number[] {
    this.clear();
    // TODO: check for maximum storage
    this.indices = new Map(entries.map(([key, _], index) => [key, index]));
    this.values = [...entries.map(([_, value]) => value)];
    const values = this.values.map((entry, i) => ({
      value: entry,
      offset: i * this.stride,
    }));
    const data = new ArrayBuffer(entries.length * this.stride);
    this.serialize(data, values);
    this.device.queue.writeBuffer(this.buffer, 0, data);
    return [...this.values.keys()];
  }

  // TODO: Optimize this
  // - make sure freeList is always sorted
  // - find with binary search
  // - when inserting a free slot, check if it can be merged
  findFreeIndex(): number | undefined {
    let slot = this.freeList.pop();
    if (slot !== undefined) {
      return slot;
    }
    if (this.values.length * this.stride >= this.maxSize) {
      console.error(`[${this.label}] maximum storage reached`);
      return undefined;
    }
    return this.values.length;
  }

  add(key: k, value: v): number {
    const index = this.findFreeIndex();
    if (index === undefined) {
      return 0xffff;
    }
    this.indices.set(key, index);
    if (index < this.values.length) {
      this.values[index] = value;
    } else {
      this.values.push(value);
    }
    const offset = index * this.stride;
    const data = new ArrayBuffer(this.stride);
    this.serialize(data, [{ value, offset: 0 }]);
    this.device.queue.writeBuffer(this.buffer, offset, data);
    return index;
  }
}
