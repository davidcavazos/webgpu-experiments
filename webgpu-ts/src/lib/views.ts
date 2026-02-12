import { mat4, type Mat4Arg } from "wgpu-matrix";
import type { EntityId } from "./entities";
import { GPUPool } from "./gpu/pool";
import { UINT8_MAX } from "./stdlib";

export type ViewId = number;
export class Views {
  static readonly MAX_CAPACITY = UINT8_MAX;
  static readonly ENTITIES = { size: 4 }; // u32
  static readonly VIEW = {
    size: 128,
    view: (data: ArrayBuffer) => ({
      view_projection: new Float32Array(data, 0, 16),
      inverse_view_projection: new Float32Array(data, 64, 16),
    }),
  };

  device: GPUDevice;
  capacity: number;
  entities: GPUPool;
  buffer: GPUBuffer;
  pinned: EntityId[];

  constructor(device: GPUDevice, args?: {
    capacity?: number,
  }) {
    this.device = device;
    this.capacity = args?.capacity ?? Views.MAX_CAPACITY;
    if (this.capacity > Views.MAX_CAPACITY) {
      throw new Error(`Views capacity ${this.capacity} exceeds maximum ${Views.MAX_CAPACITY}`);
    }
    this.entities = new GPUPool(device, {
      blockSize: Views.ENTITIES.size,
      buffer: this.device.createBuffer({
        label: 'views_entities',
        size: this.capacity * Views.ENTITIES.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    this.buffer = this.device.createBuffer({
      label: 'views',
      size: this.capacity * Views.VIEW.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.pinned = [];
  }

  clear() {
    this.entities.clear();
    this.pinned = [];
  }

  write(viewId: ViewId, args: {
    view_projection: Mat4Arg;
  }) {
    if (viewId >= this.capacity) {
      throw new Error(`View ID ${viewId} exceeds capacity ${this.capacity}`);
    }
    const data = new ArrayBuffer(Views.VIEW.size);
    const view = Views.VIEW.view(data);
    view.view_projection.set(args.view_projection);
    view.inverse_view_projection.set(mat4.inverse(args.view_projection));
    this.device.queue.writeBuffer(this.buffer, viewId * Views.VIEW.size, data);
  }
}