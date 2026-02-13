import { mat4, type Mat4, type Mat4Arg } from "wgpu-matrix";
import { GPUPool } from "./gpu/pool";
import { UINT8_MAX } from "./stdlib";
import type { EntityName } from "./entities";

export type ViewId = number;
export interface View {
  view_projection: Mat4;
  pinned?: boolean;
}
export interface ViewRef {
  id: ViewId;
  entity: EntityName;
  view_projection: Mat4;
  pinned: boolean;
}


export class Views {
  static readonly MAX_CAPACITY = UINT8_MAX;
  static readonly ENTITY_ID = { size: 4 }; // u32
  static readonly VIEW = {
    size: 128,
    view: (data: ArrayBuffer) => ({
      view_projection: new Float32Array(data, 0, 16),
      inverse_view_projection: new Float32Array(data, 64, 16),
    }),
  };

  device: GPUDevice;
  capacity: number;
  entries: Map<EntityName, ViewRef>;
  entities: GPUPool;
  views: GPUBuffer;

  constructor(device: GPUDevice, args?: {
    capacity?: number,
  }) {
    this.device = device;
    this.capacity = args?.capacity ?? 16;
    if (this.capacity > Views.MAX_CAPACITY) {
      throw new Error(`Views capacity ${this.capacity} exceeds maximum ${Views.MAX_CAPACITY}`);
    }
    this.entries = new Map();
    this.entities = new GPUPool(this.device, {
      blockSize: Views.ENTITY_ID.size,
      buffer: this.device.createBuffer({
        label: 'views_entities',
        size: this.capacity * Views.ENTITY_ID.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    this.views = this.device.createBuffer({
      label: 'views',
      size: this.capacity * Views.VIEW.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  clear() {
    this.entries.clear();
    this.entities.clear();
  }

  set(name: EntityName, view: View): ViewRef {
    let ref = this.entries.get(name);
    if (ref === undefined) {
      const id = this.entities.allocate();
      ref = {
        id,
        entity: name,
        view_projection: mat4.copy(view.view_projection),
        pinned: view.pinned ?? false,
      };
    } else {
      ref.view_projection = mat4.copy(view.view_projection);
      ref.pinned = view.pinned ?? false;
    }
    this.entries.set(name, ref);
    this.write(ref);
    return ref;
  }

  write(ref: ViewRef) {
    const data = new ArrayBuffer(Views.VIEW.size);
    const view = Views.VIEW.view(data);
    view.view_projection.set(ref.view_projection);
    view.inverse_view_projection.set(mat4.inverse(ref.view_projection));
    this.device.queue.writeBuffer(this.views, ref.id * Views.VIEW.size, data);
  }
}