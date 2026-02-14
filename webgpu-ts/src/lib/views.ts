import { mat4, type Mat4, type Mat4Arg } from "wgpu-matrix";
import { GPUPool } from "./gpu/pool";
import { UINT8_MAX } from "./stdlib";
import type { EntityName } from "./entities";

const DEBUG = {
  WRITE_BUFFER: {
    ALL: false,
    ENTITIES: false,
    VIEWS: false,
  },
};

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
    size: 256,
    view: (data: ArrayBuffer) => ({
      entity_id: new Uint32Array(data, 0, 1),
      _pack_lod_flags: new Uint32Array(data, 4, 1),
      direction: new Uint16Array(data, 8, 3),
      shadow_bias: new Uint16Array(data, 14, 1),
      world_position: new Float32Array(data, 16, 3),
      size_culling_k: new Float32Array(data, 28, 1),
      frustum: new Float32Array(data, 32, 24),
      view_projection: new Float32Array(data, 128, 16),
      inverse_view_projection: new Float32Array(data, 192, 16),
    }),
  };

  device: GPUDevice;
  capacity: number;
  entries: Map<EntityName, ViewRef>;
  entities: GPUPool;
  buffer: GPUBuffer;

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
    this.buffer = this.device.createBuffer({
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
    this.writeEntity(ref);
    this.writeView(ref);
    return ref;
  }

  writeEntity(ref: ViewRef) {
    const data = new Uint32Array([ref.id]);
    if (DEBUG.WRITE_BUFFER.ALL || DEBUG.WRITE_BUFFER.ENTITIES) {
      console.log('writeEntity', ref.id, data);
    }
    this.device.queue.writeBuffer(this.entities.buffer, ref.id * data.byteLength, data);
  }

  writeView(ref: ViewRef) {
    const data = new ArrayBuffer(Views.VIEW.size);
    const view = Views.VIEW.view(data);
    view.view_projection.set(ref.view_projection);
    view.inverse_view_projection.set(mat4.inverse(ref.view_projection));
    if (DEBUG.WRITE_BUFFER.ALL || DEBUG.WRITE_BUFFER.VIEWS) {
      console.log('writeView', ref, view);
    }
    this.device.queue.writeBuffer(this.buffer, ref.id * Views.VIEW.size, data);
  }
}