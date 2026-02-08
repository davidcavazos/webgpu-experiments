import { Entities, type EntityId } from "./entities";
import { Meshes, type MeshRef } from "./meshes";
import type { Entity, EntityName, Material, MaterialName, Mesh, MeshName, Scene } from "./scene";
import { UINT32_MAX } from "./stdlib";

export class Stage {
  device: GPUDevice;
  meshes: Meshes;
  entities: Entities;
  constructor(device: GPUDevice, args?: {
    geometryHeapSize?: number,
    meshesPoolCapacity?: number,
    entitiesCapacity?: number,
  }) {
    this.device = device;
    this.meshes = new Meshes(this.device, {
      capacity: args?.meshesPoolCapacity,
      heapSize: args?.geometryHeapSize,
    });
    this.entities = new Entities(this.device, {
      capacity: args?.entitiesCapacity,
    });
  }

  clear() {
    this.meshes.clear();
    this.entities.clear();
  }

  load(scene: Scene) {
    for (const [name, mesh] of Object.entries(scene.meshes)) {
      this.addMesh(name, mesh);
    }
    for (const [name, material] of Object.entries(scene.materials)) {
      this.addMaterial(name, material);
    }
    for (const [name, entity] of Object.entries(scene.entities)) {
      this.addEntity(name, entity);
    }
  }

  addEntity(name: EntityName, entity: Entity, parentId?: EntityId): EntityId {
    const id = this.entities.add(name);
    this.entities.setLocal(id, entity, parentId);
    this.entities.setMesh(id, this.meshes.get(name)?.id);
    for (const [childName, child] of Object.entries(entity.children ?? {})) {
      this.addEntity(childName, child, id);
    }
    return id;
  }

  addMesh(name: MeshName, mesh: Mesh): MeshRef {
    const ref = this.meshes.add(name, mesh);
    this.meshes.setVertices(ref.id, UINT32_MAX);
    this.meshes.setBounds(ref.id, ref.bounds);
    return ref;
  }

  addMaterial(name: MaterialName, material: Material) {
    // console.log(name, material);
  }
}
