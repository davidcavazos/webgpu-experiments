import { mat4, quat, vec3, vec4, type Mat4, type Mat4Arg, type QuatArg, type Vec3, type Vec3Arg, type Vec4 } from "wgpu-matrix";
import { GPUPool } from "./gpu/pool";
import { UINT8_MAX } from "./stdlib";
import type { EntityId, EntityName, EntityRef } from "./entities";

const DEBUG = {
  WRITE_BUFFER: {
    ALL: false,
    ENTITIES: false,
    VIEWS: false,
  },
};

export interface Frustum {
  left: Vec4;
  right: Vec4;
  bottom: Vec4;
  top: Vec4;
  near: Vec4;
  far: Vec4;
};

export type ViewId = number;
export interface View {
  projection?: Mat4Arg;
  shadow_bias?: number;
  lod?: 0 | 1 | 2 | 3;
  pinned?: boolean;
}
export interface ViewRef {
  id: ViewId;
  entity: EntityName;
  entityId: EntityId;
  lod: 0 | 1 | 2 | 3;
  shadow_bias: number;
  pinned: boolean;
}
export const VIEW_FLAG_PINNED = 1 << 0;

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
  pool: GPUPool;

  constructor(device: GPUDevice, args?: {
    capacity?: number,
  }) {
    this.device = device;
    this.capacity = args?.capacity ?? 16;
    if (this.capacity > Views.MAX_CAPACITY) {
      throw new Error(`Views capacity ${this.capacity} exceeds maximum ${Views.MAX_CAPACITY}`);
    }
    this.entries = new Map();
    this.pool = new GPUPool(this.device, {
      blockSize: Views.VIEW.size,
      buffer: this.device.createBuffer({
        label: 'views',
        size: this.capacity * Views.VIEW.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
  }

  clear() {
    this.entries.clear();
    this.pool.clear();
  }

  add(entity: EntityRef): ViewRef {
    const ref: ViewRef = {
      id: this.entries.get(entity.name)?.id ?? this.pool.allocate(),
      entity: entity.name,
      entityId: entity.id,
      lod: 0,
      shadow_bias: 0,
      pinned: false,
    };
    this.entries.set(entity.name, ref);
    this.writeView(ref);
    return ref;
  }

  set(ref: ViewRef, view: View): ViewRef {
    ref.lod = view.lod ?? ref.lod;
    ref.shadow_bias = view.shadow_bias ?? ref.shadow_bias;
    ref.pinned = view.pinned ?? ref.pinned;
    this.entries.set(ref.entity, ref);
    this.writeView(ref);
    return ref;
  }

  writeView(ref: ViewRef) {
    const data = new ArrayBuffer(Views.VIEW.size);
    const view = Views.VIEW.view(data);
    view.entity_id.set([ref.entityId]);
    view.shadow_bias.set([ref.shadow_bias]);
    view._pack_lod_flags.set([ref.lod << 16
      | (ref.pinned ? VIEW_FLAG_PINNED : 0)
    ]);
    if (DEBUG.WRITE_BUFFER.ALL || DEBUG.WRITE_BUFFER.VIEWS) {
      console.log('writeView', ref, view);
    }
    this.device.queue.writeBuffer(this.pool.buffer, ref.id * Views.VIEW.size, data);
  }
}
