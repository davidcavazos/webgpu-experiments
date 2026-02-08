import { Entities } from "./entities";
import { Meshes } from "./meshes";
import type { Mesh, MeshName, Scene } from "./scene";

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

  loadScene(scene: Scene) {
    Object.entries(scene.meshes).forEach(this.loadMesh);
  }

  loadMesh([name, mesh]: [MeshName, Mesh]) {
    console.log(name, mesh);
  }
}
