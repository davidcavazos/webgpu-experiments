import { Meshes } from "./meshes";

export class Renderer {
  device: GPUDevice;
  meshes: Meshes;
  constructor(device: GPUDevice, args?: {
    geometryHeapSize?: number,
    meshesPoolCapacity?: number,
  }) {
    this.device = device;
    this.meshes = new Meshes(this.device, {
      capacity: args?.meshesPoolCapacity,
      heapSize: args?.geometryHeapSize,
    });
  }

  draw() {
  }
}
