import { Entities, type EntityId, type EntityRef } from "./entities";
import { Meshes, type MeshId, type MeshRef } from "./meshes";
import type { Entity, EntityName, Material, MaterialName, Mesh, MeshName, Scene } from "./scene";
import { UINT32_MAX } from "./stdlib";

export class Stage {
  device: GPUDevice;
  globals: GPUBuffer;
  entities: Entities;
  meshes: Meshes;

  constructor(device: GPUDevice, args?: {
    entitiesPoolCapacity?: number,
    meshesPoolCapacity?: number,
    geometryHeapSize?: number,
  }) {
    this.device = device;
    this.globals = this.device.createBuffer({
      label: 'globals',
      size: 12,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.entities = new Entities(this.device, {
      capacity: args?.entitiesPoolCapacity,
    });
    this.meshes = new Meshes(this.device, {
      capacity: args?.meshesPoolCapacity,
      heapSize: args?.geometryHeapSize,
    });
  }

  clear() {
    this.entities.clear();
    this.meshes.clear();
  }

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
    const ref = this.entities.add(name);
    this.updateEntityLocal(ref, entity);
    this.updateEntityMesh(ref, this.meshes.get(entity.mesh ?? name)?.id);
    for (const [childName, child] of Object.entries(entity.children ?? {})) {
      this.loadEntity(childName, { ...child, parentId: ref.id });
    }
    return ref;
  }

  updateEntityLocal(ref: EntityRef, entity: Entity) {
    ref.opaque = entity.opaque ?? false;
    this.entities.writeLocal(ref.id, entity);
  }
  updateEntityMesh(ref: EntityRef, meshId: MeshId | undefined) {
    if (meshId !== ref.meshId) {
      ref.meshId = meshId;
      this.entities.writeMesh(ref.id, meshId);
    }
  }

  loadMesh(name: MeshName, mesh: Mesh): MeshRef {
    const ref = this.meshes.add(name, mesh);
    this.meshes.writeVerticesRef(ref.id, UINT32_MAX);
    this.meshes.writeBounds(ref.id, ref.bounds);
    return ref;
  }

  loadMaterial(name: MaterialName, material: Material) {
    // console.log(name, material);
  }

  writeGlobals() {
    const data = new ArrayBuffer(this.globals.size);
    new Uint32Array(data, 0).set([
      this.entities.size(), // entities_size
    ]);
    this.device.queue.writeBuffer(this.globals, 0, data);
  }
}
