import { GPUPool } from "./gpu/pool";
import type { MeshId } from "./meshes";
import type { Entity } from "./scene";
import { UINT16_MAX, UINT32_MAX } from "./stdlib";
import { Transform } from "./transform";

export const FLAGS_OPAQUE = 1 << 0;

export type EntityId = number;
export type EntityName = string;

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001000001000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c35c7a3a1cbc54b3eb16a2bbef5804c9e0103e694e7446ffab06605762d90b036f34effb09a2f69af6ccaa7d91ac4bba574a0e893af33564b7a793b8cfd7c76856412dff404392c1f8d348626d01a08cb84bbd597fde188effe84fada3063e8284e8f01730a7902ea332929710e0ffeafd4754c0e9ab00efbb51e55edc3753bb0f9be4e69b611d0e7fbcf29616284ed2716063ffe145a6a
const entities_local = {
  size: 32,
  view: (data: ArrayBuffer) => ({
    position: new Float32Array(data, 0, 3),
    scale: new Float32Array(data, 12, 1),
    rotation: new Uint16Array(data, 16, 4),
    parent_id: new Uint32Array(data, 24, 1),
    flags: new Uint32Array(data, 28, 1),
  })
};
const entities_world = {
  size: 32,
};
const entities_mesh = {
  size: 4,
  view: (data: ArrayBuffer) => ({
    mesh_id: new Uint32Array(data, 0, 1),
  })
};
const entities_material = {
  size: 4,
  view: (data: ArrayBuffer) => ({
    material_id: new Uint32Array(data, 0, 1),
  })
};
const entities_subscriptions = {
  size: 4,
  view: (data: ArrayBuffer) => ({
    events: new Uint32Array(data, 0, 1),
  })
};

export class Entities {
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
      blockSize: entities_local.size,
      buffer: this.device.createBuffer({
        label: 'entities_local',
        size: this.capacity * entities_local.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
    });
    this.world_A = this.device.createBuffer({
      label: 'entities_world_A',
      size: this.capacity * entities_world.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.world_B = this.device.createBuffer({
      label: 'entities_world_B',
      size: this.capacity * entities_world.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.mesh = this.device.createBuffer({
      label: 'entities_mesh',
      size: this.capacity * entities_mesh.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.material = this.device.createBuffer({
      label: 'entities_material',
      size: this.capacity * entities_material.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.subscriptions = this.device.createBuffer({
      label: 'entities_subscriptions',
      size: this.capacity * entities_subscriptions.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  clear() {
    this.entries.clear();
    this.local.clear();
  }

  // Number of entities in use.
  count(): number {
    return this.entries.size;
  }

  // Size of the buffer in use, might include deleted entities.
  size(): number {
    return this.local.size;
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

  writeLocal(id: EntityId, entity: Entity, parentId?: EntityId) {
    const data = new ArrayBuffer(entities_local.size);
    const view = entities_local.view(data);
    const transform = new Transform(entity.transform);
    view.position.set(transform.getPosition());
    view.scale.set([transform.getScaleUniform()]);
    view.rotation.set(transform.getRotation());
    view.parent_id.set([parentId ?? UINT32_MAX]);
    view.flags.set([0
      | (entity.opaque ? FLAGS_OPAQUE : 0),
    ]);
    this.local.write(id, data);
  }

  writeMesh(id: EntityId, meshId: MeshId | undefined) {
    const data = new ArrayBuffer(entities_mesh.size);
    const view = entities_mesh.view(data);
    view.mesh_id.set([meshId ?? UINT16_MAX]);
    this.device.queue.writeBuffer(this.mesh, id * data.byteLength, data);
  }

  // TODO: setMaterial
  // TODO: setSubscription
}
