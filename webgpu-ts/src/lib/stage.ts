import { mat4, type Mat4 } from "wgpu-matrix";
import { Cameras, type CameraRef } from "./cameras";
import { Entities, type Entity, type EntityId, type EntityName, type EntityRef } from "./entities";
import type { Material, MaterialName } from "./materials";
import { Meshes, type Mesh, type MeshName, type MeshRef } from "./meshes";
import type { Scene } from "./scene";
import { UINT32_MAX } from "./stdlib";
import { Views } from "./views";

export interface Viewport {
  min?: { x?: number; y?: number; };
  max?: { x?: number; y?: number; };
  projection: (width: number, height: number) => Mat4;
}

export class Stage {
  device: GPUDevice;
  globals: GPUBuffer;
  entities: Entities;
  views: Views;
  viewports: Map<CameraRef, Viewport>;

  constructor(device: GPUDevice, args?: {
    entities?: {
      capacity?: number,
      meshes?: {
        capacity?: number,
        heapSize?: number,
      };
      cameras?: {
        capacity?: number,
      };
    },
    views?: {
      capacity?: number,
    };
    cameras?: {
      capacity?: number,
    };
  }) {
    this.device = device;
    this.globals = this.device.createBuffer({
      label: 'globals',
      size: 12,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.entities = new Entities(this.device, args?.entities);
    this.views = new Views(this.device, {
      capacity: args?.views?.capacity,
    });
    this.viewports = new Map();
  }

  clear() {
    this.entities.clear();
    this.views.clear();
    this.viewports.clear();
  }

  setViewport(ref: EntityRef, viewport: Viewport) {
    if (ref.camera === undefined) {
      ref.camera = this.entities.cameras.set(ref.name, {
        projection: mat4.identity(),
      });
    }
    this.viewports.set(ref.camera, viewport);
  }
  resizeViewports(width: number, height: number) {
    for (const [camera, viewport] of this.viewports) {
      camera.projection = viewport.projection(width, height);
      this.entities.cameras.set(camera.entity, camera);
    }
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
    return this.entities.load(scene);
  }

  writeGlobals() {
    const data = new ArrayBuffer(this.globals.size);
    new Uint32Array(data, 0).set([
      this.entities.size(), // entities_size
    ]);
    this.device.queue.writeBuffer(this.globals, 0, data);
  }
}
