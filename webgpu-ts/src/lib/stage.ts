import { Entities, type Entity, type EntityId, type EntityName, type EntityRef } from "./entities";
import type { Material, MaterialName } from "./materials";
import { Meshes, type Mesh, type MeshName, type MeshRef } from "./meshes";
import type { Scene } from "./scene";
import { UINT32_MAX } from "./stdlib";
import { Views } from "./views";

export interface Viewport {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export class Stage {
  device: GPUDevice;
  globals: GPUBuffer;
  entities: Entities;
  meshes: Meshes;
  views: Views;
  viewports: Map<EntityId, Viewport>;

  constructor(device: GPUDevice, args?: {
    entities?: {
      capacity?: number,
    },
    meshes?: {
      capacity?: number,
      heapSize?: number,
    };
    views?: {
      capacity?: number,
    };
  }) {
    this.device = device;
    this.globals = this.device.createBuffer({
      label: 'globals',
      size: 12,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.entities = new Entities(this.device, {
      capacity: args?.entities?.capacity,
    });
    this.meshes = new Meshes(this.device, {
      capacity: args?.meshes?.capacity,
      heapSize: args?.meshes?.heapSize,
    });
    this.views = new Views(this.device, {
      capacity: args?.views?.capacity,
    });
    this.viewports = new Map();
  }

  clear() {
    this.entities.clear();
    this.meshes.clear();
  }

  setViewport(name: EntityName, viewport: Viewport) {
    const entity = this.entities.get(name);
    if (!entity) {
      throw new Error(`Entity ${name} not found`);
    }
    this.viewports.set(entity.id, viewport);
  }

  find(name: EntityName): EntityRef | undefined {
    // Try exact match first.
    const ref = this.entities.entries.get(name);
    if (ref !== undefined) {
      return ref;
    }
    // Try to find by suffix.
    for (const ref of this.entities) {
      if (ref.name.endsWith(`/${name}`)) {
        return ref;
      }
    }
    return undefined;
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
    this.updateEntityMesh(ref, entity.mesh);
    for (const [childName, child] of Object.entries(entity.children ?? {})) {
      this.loadEntity(`${name}/${childName}`, { ...child, parentId: ref.id });
    }
    return ref;
  }

  updateEntityLocal(ref: EntityRef, entity: Entity) {
    this.entities.set(ref.name, { ...ref, opaque: entity.opaque });
    this.entities.writeLocal(ref.id, entity);
  }
  updateEntityMesh(ref: EntityRef, mesh: MeshName | undefined) {
    if (mesh && mesh !== ref.mesh) {
      this.entities.set(ref.name, { ...ref, mesh });
      const meshId = this.meshes.get(mesh)?.id;
      this.entities.writeMesh(ref.id, meshId);
    }
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

  writeGlobals() {
    const data = new ArrayBuffer(this.globals.size);
    new Uint32Array(data, 0).set([
      this.entities.size(), // entities_size
    ]);
    this.device.queue.writeBuffer(this.globals, 0, data);
  }
}
