import { GPUPool } from "./gpu/pool";
import type { MeshId, MeshName } from "./meshes";
import { UINT16_MAX, UINT32_MAX } from "./stdlib";
import { Transform } from "./transform";

export const FLAGS_OPAQUE = 1 << 0;

export type EntityId = number;
export type EntityName = string;
export interface Entity {
  parentId?: EntityId;
  transform?: Transform;
  children?: Record<EntityName, Entity>;
  opaque?: boolean;
}
export interface EntityMesh {
  meshId?: MeshId;
}

export class Entities {
  static readonly LOCAL_STRIDE = 32;
  static readonly WORLD_STRIDE = 32;
  static readonly MESH_STRIDE = 16;
  static readonly MATERIAL_STRIDE = 16;
  static readonly SUBSCRIPTIONS_STRIDE = 4;
  device: GPUDevice;
  capacity: number;
  entries: Map<EntityName, EntityId>;
  local: GPUPool;
  world_A: GPUBuffer;
  world_B: GPUBuffer;
  mesh: GPUBuffer;
  material: GPUBuffer;
  subscriptions: GPUBuffer;
  constructor(device: GPUDevice, args?: { capacity?: number; }) {
    this.device = device;
    this.capacity = args?.capacity ?? 1000000;
    this.entries = new Map();
    this.local = new GPUPool(this.device, {
      blockSize: Entities.LOCAL_STRIDE,
      buffer: this.device.createBuffer({
        label: 'entities_local',
        size: this.capacity * Entities.LOCAL_STRIDE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
    });
    this.world_A = this.device.createBuffer({
      label: 'entities_world_A',
      size: this.capacity * Entities.WORLD_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.world_B = this.device.createBuffer({
      label: 'entities_world_B',
      size: this.capacity * Entities.WORLD_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.mesh = this.device.createBuffer({
      label: 'entities_mesh',
      size: this.capacity * Entities.MATERIAL_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.material = this.device.createBuffer({
      label: 'entities_material',
      size: this.capacity * Entities.MATERIAL_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.subscriptions = this.device.createBuffer({
      label: 'entities_subscriptions',
      size: this.capacity * Entities.SUBSCRIPTIONS_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  add(name: EntityName): EntityId {
    let id = this.entries.get(name);
    if (id !== undefined) {
      return id;
    }
    id = this.local.alloc();
    this.entries.set(name, id);
    return id;
  }

  setEntity(id: EntityId, entity: Entity) {
    const data = new ArrayBuffer(Entities.LOCAL_STRIDE);
    const transform = entity.transform ?? new Transform();
    new Uint32Array(data, 0, 1).set([entity.parentId ?? UINT32_MAX]);
    transform.getPosition(new Float32Array(data, 4, 3));
    transform.getRotationF16(new Float16Array(data, 16, 4));
    new Float16Array(data, 24, 1).set([transform.getScaleUniform()]);
    new Uint16Array(data, 26, 1).set([0
      | (entity.opaque ? FLAGS_OPAQUE : 0)
    ]);
    this.local.write(id, data);
  }

  setMesh(id: EntityId, mesh: EntityMesh) {
    const data = new ArrayBuffer(Entities.MESH_STRIDE);
    new Uint16Array(data, 0, 1).set([mesh.meshId ?? UINT16_MAX]);
    this.device.queue.writeBuffer(this.mesh, id * data.byteLength, data);
  }

  // TODO: setMaterial
  // TODO: setSubscription
}
