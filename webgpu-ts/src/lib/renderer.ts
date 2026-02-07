import type { Transform } from "./transform";
import { Meshes } from "./meshes";

export type MaterialId = number;
export type MaterialName = string;
export interface Material {
}
export interface MaterialRef {
}

export type EntityId = number;
export type EntityName = string;
export interface Entity {
  transform?: Transform;
  children?: Record<EntityName, Entity>;
}
export interface EntityRef {
}

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
