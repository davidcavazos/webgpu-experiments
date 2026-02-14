import { mat4, type Mat4 } from "wgpu-matrix";
import { Cameras, type CameraRef } from "./cameras";
import { Entities, type Entity, type EntityId, type EntityName, type EntityRef } from "./entities";
import type { Material, MaterialName } from "./materials";
import { Meshes, type Mesh, type MeshName, type MeshRef } from "./meshes";
import type { Scene } from "./scene";
import { UINT32_MAX } from "./stdlib";
import { Views } from "./views";
import { Draws } from "./draws";

export interface Viewport {
  min?: { x?: number; y?: number; };
  max?: { x?: number; y?: number; };
  projection: (width: number, height: number) => Mat4;
}

export class Stage {
  static readonly GLOBALS = {
    size: 16,
    view: (data: ArrayBuffer) => ({
      screen_width: new Uint32Array(data, 0, 1),
      screen_height: new Uint32Array(data, 4, 1),
      entities_size: new Uint32Array(data, 8, 1),
      views_size: new Uint32Array(data, 12, 1),
    }),
  };

  device: GPUDevice;
  globals: GPUBuffer;
  entities: Entities;
  draws: Draws;
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
    draws?: {
      capacity?: number;
    };
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
      size: Stage.GLOBALS.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.entities = new Entities(this.device, args?.entities);
    this.draws = new Draws(this.device, {
      instances: {
        capacity: args?.entities?.capacity,
      },
      draw_cmds: {
        capacity: args?.draws?.capacity,
      },
    });
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
      ref.camera = this.entities.setCamera(ref, { projection: mat4.identity() });
      this.entities.set(ref.name, ref);
    }
    this.viewports.set(ref.camera, viewport);
    this.views.add(ref);
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

  writeGlobals(args: {
    screen_width: number,
    screen_height: number,
  }) {
    const data = new ArrayBuffer(Stage.GLOBALS.size);
    const view = Stage.GLOBALS.view(data);
    view.screen_width.set([args.screen_width]);
    view.screen_height.set([args.screen_height]);
    view.entities_size.set([this.entities.local.size]);
    view.views_size.set([this.views.pool.size]);
    this.device.queue.writeBuffer(this.globals, 0, data);
  }
}
