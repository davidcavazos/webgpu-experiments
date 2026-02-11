import { quat, vec3, type QuatArg, type Vec3Arg } from "wgpu-matrix";
import { GPUPool } from "./gpu/pool";
import type { MeshId } from "./meshes";
import type { Entity, Transform } from "./scene";
import { UINT16_MAX, UINT32_MAX } from "./stdlib";

export const FLAGS_SLEEP /* */ = 1 << 0;
export const FLAGS_OPAQUE /**/ = 1 << 1;

export type EntityId = number;
export type EntityName = string;
export type EntityRef = {
  id: EntityId;
  meshId?: MeshId;
  opaque?: boolean;
};

export class Entities {
  // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001000001000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c35c7a3a1cbc54b3eb16a2bbef5804c9e0103e694e7446ffab06605762d90b036f34effb09a2f69af6ccaa7d91ac4bba574a0e893af33564b7a793b8cfd7c76856412dff404392c1f8d348626d01a08cb84bbd597fde188effe84fada3063e8284e8f01730a7902ea332929710e0ffeafd4754c0e9ab00efbb51e55edc3753bb0f9be4e69b611d0e7fbcf29616284ed2716063ffe145a6a
  static readonly LOCAL = {
    size: 32,
    view: (data: ArrayBuffer) => ({
      position: new Float32Array(data, 0, 3),
      scale: new Float32Array(data, 12, 1),
      rotation: new Uint16Array(data, 16, 4),
      parent_id: new Uint32Array(data, 24, 1),
      flags: new Uint32Array(data, 28, 1),
    })
  };
  static readonly WORLD = { size: 32 };
  static readonly MESH = {
    size: 4,
    view: (data: ArrayBuffer) => ({
      mesh_id: new Uint32Array(data, 0, 1),
    })
  };
  static readonly MATERIAL = {
    size: 4,
    view: (data: ArrayBuffer) => ({
      material_id: new Uint32Array(data, 0, 1),
    })
  };
  static readonly SUBSCRIPTIONS = {
    size: 4,
    view: (data: ArrayBuffer) => ({
      events: new Uint32Array(data, 0, 1),
    })
  };

  device: GPUDevice;
  capacity: number;
  entries: Map<EntityName, EntityRef>;
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
      blockSize: Entities.LOCAL.size,
      buffer: this.device.createBuffer({
        label: 'entities_local',
        size: this.capacity * Entities.LOCAL.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
    });
    this.world_A = this.device.createBuffer({
      label: 'entities_world_A',
      size: this.capacity * Entities.WORLD.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.world_B = this.device.createBuffer({
      label: 'entities_world_B',
      size: this.capacity * Entities.WORLD.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.mesh = this.device.createBuffer({
      label: 'entities_mesh',
      size: this.capacity * Entities.MESH.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.material = this.device.createBuffer({
      label: 'entities_material',
      size: this.capacity * Entities.MATERIAL.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.subscriptions = this.device.createBuffer({
      label: 'entities_subscriptions',
      size: this.capacity * Entities.SUBSCRIPTIONS.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  *[Symbol.iterator](): IterableIterator<[EntityName, EntityRef]> {
    yield* this.entries;
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

  add(name: EntityName): EntityRef {
    let ref = this.entries.get(name);
    if (ref !== undefined) {
      return ref;
    }
    const id = this.local.alloc();
    this.entries.set(name, { id });
    return { id };
  }

  writeLocal(id: EntityId, entity: Entity) {
    const data = new ArrayBuffer(Entities.LOCAL.size);
    const view = Entities.LOCAL.view(data);
    view.position.set(entity.transform?.position ?? vec3.create());
    view.scale.set([entity.transform?.scale ?? 1]);
    view.rotation.set(entity.transform?.rotation ?? quat.identity());
    view.parent_id.set([entity.parentId ?? UINT32_MAX]);
    view.flags.set([0
      | (entity.opaque ? FLAGS_OPAQUE : 0),
    ]);
    this.local.write(id, data);
  }

  writeMesh(id: EntityId, meshId: MeshId | undefined) {
    const data = new ArrayBuffer(Entities.MESH.size);
    const view = Entities.MESH.view(data);
    view.mesh_id.set([meshId ?? UINT16_MAX]);
    this.device.queue.writeBuffer(this.mesh, id * data.byteLength, data);
  }

  // TODO: setMaterial
  // TODO: setSubscription
}
