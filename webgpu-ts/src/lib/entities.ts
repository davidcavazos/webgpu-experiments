import { quat, vec3, type QuatArg, type Vec3Arg } from "wgpu-matrix";
import { GPUPool } from "./gpu/pool";
import { Meshes, type Mesh, type MeshId, type MeshName, type MeshRef } from "./meshes";
import { UINT16_MAX, UINT32_MAX } from "./stdlib";
import type { Material, MaterialName } from "./materials";
import { Cameras, type Camera, type CameraId, type CameraRef } from "./cameras";
import type { Light, LightId, LightRef } from "./lights";
import type { Scene } from "./scene";

export const FLAGS_SLEEP = 1 << 0;
export const FLAGS_OPAQUE = 1 << 1;

export type Transform = {
  position?: Vec3Arg;
  rotation?: QuatArg;
  scale?: number;
};

export type EntityId = number;
export type EntityName = string;
export interface Entity {
  name: EntityName;
  parentId?: EntityId;
  transform?: Transform;
  mesh?: MeshName;
  material?: MaterialName;
  camera?: Camera;
  light?: Light;
  children?: Record<EntityName, Entity>;
  opaque?: boolean;
}
export type EntityRef = {
  id: EntityId;
  name: EntityName;
  mesh?: MeshName;
  material?: MaterialName;
  camera?: CameraRef;
  light?: LightRef;
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
  static readonly VIEW = {
    size: 8,
    view: (data: ArrayBuffer) => ({
      camera_id: new Uint32Array(data, 0, 1),
      light_id: new Uint32Array(data, 4, 1),
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
  view: GPUBuffer;
  subscriptions: GPUBuffer;
  meshes: Meshes;
  cameras: Cameras;

  constructor(device: GPUDevice, args?: {
    capacity?: number;
    meshes?: {
      capacity?: number;
      heapSize?: number;
    };
    cameras?: {
      capacity?: number;
    };
  }) {
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
    this.view = this.device.createBuffer({
      label: 'entities_view',
      size: this.capacity * Entities.VIEW.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.subscriptions = this.device.createBuffer({
      label: 'entities_subscriptions',
      size: this.capacity * Entities.SUBSCRIPTIONS.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.meshes = new Meshes(this.device, args?.meshes);
    this.cameras = new Cameras(this.device, args?.cameras);
  }

  *[Symbol.iterator](): IterableIterator<EntityRef> {
    yield* this.entries.values();
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

  get(name: EntityName): EntityRef | undefined {
    return this.entries.get(name);
  }
  set(name: EntityName, ref: EntityRef) {
    this.entries.set(name, ref);
  }

  add(name: EntityName, entity: Entity): EntityRef {
    let ref = this.entries.get(name);
    if (ref === undefined) {
      ref = { id: this.local.allocate(), name };
    }
    const id = this.local.allocate();
    this.entries.set(name, { id, name });
    this.setLocal(ref, entity);
    this.setMesh(ref, entity.mesh);
    this.setCamera(ref, entity.camera);
    return { id, name };
  }

  setLocal(ref: EntityRef, entity: Entity) {
    this.entries.set(ref.name, ref);
    this.writeLocal(ref.id, entity);
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

  setMesh(ref: EntityRef, meshName: MeshName | undefined) {
    let meshId: MeshId | undefined = undefined;
    if (meshName === undefined) {
      ref.mesh = undefined;
    } else {
      const meshRef = this.meshes.get(meshName);
      if (meshRef === undefined) {
        throw new Error(`Mesh ${meshName} not found for entity ${ref.name}`);
      }
      ref.mesh = meshName;
      meshId = meshRef.id;
    }
    this.entries.set(ref.name, ref);
    this.writeMesh(ref.id, meshId);
  }
  writeMesh(id: EntityId, meshId: MeshId | undefined) {
    const data = new ArrayBuffer(Entities.MESH.size);
    const view = Entities.MESH.view(data);
    view.mesh_id.set([meshId ?? UINT16_MAX]);
    this.device.queue.writeBuffer(this.mesh, id * data.byteLength, data);
  }

  // TODO: setMaterial

  setCamera(ref: EntityRef, camera: Camera | undefined) {
    let cameraId: CameraId | undefined = undefined;
    if (camera === undefined) {
      ref.camera = undefined;
    } else {
      ref.camera = this.cameras.set(ref.name, camera);
      cameraId = ref.camera.id;
    }
    this.entries.set(ref.name, ref);
    this.writeCamera(ref.id, cameraId);
  }
  writeCamera(id: EntityId, cameraId: CameraId | undefined) {
    const data = new ArrayBuffer(Entities.VIEW.size);
    const view = Entities.VIEW.view(data);
    view.camera_id.set([cameraId ?? UINT16_MAX]);
    this.device.queue.writeBuffer(this.view, id * data.byteLength, data);
  }

  // TODO: setSubscription

  load(scene: Scene) {
    for (const [name, mesh] of Object.entries(scene.meshes)) {
      this.loadMesh(name, mesh);
    }
    for (const [name, material] of Object.entries(scene.materials)) {
      this.loadMaterial(name, material);
    }
    // Load entities after meshes and materials, they're needed.
    for (const [name, entity] of Object.entries(scene.entities)) {
      this.loadEntity(name, entity);
    }
  }
  loadEntity(name: EntityName, entity: Entity): EntityRef {
    const ref = this.add(name, entity);
    for (const [childName, child] of Object.entries(entity.children ?? {})) {
      this.loadEntity(`${name}/${childName}`, { ...child, parentId: ref.id });
    }
    return ref;
  }
  loadMesh(name: MeshName, mesh: Mesh): MeshRef {
    const ref = this.meshes.add(name, mesh);
    this.meshes.writeBaseVertex(ref.id, UINT32_MAX);
    this.meshes.writeBounds(ref.id, ref.bounds);
    return ref;
  }
  loadMaterial(name: MaterialName, material: Material) {
    // console.log(name, material);
  }

}
