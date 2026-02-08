import { Entities } from "./entities";
import { Meshes } from "./meshes";

export class Renderer {
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

  draw() {
  }
}
