import { mat4, type Mat4, type Mat4Arg } from "wgpu-matrix";
import type { EntityName } from "./entities";
import { GPUPool } from "./gpu/pool";
import { UINT16_MAX } from "./stdlib";

export type CameraId = number;
export interface Camera {
  projection: Mat4Arg;
}
export type CameraRef = {
  id: CameraId;
  projection: Mat4;
};

export class Cameras {
  static readonly MAX_CAPACITY = UINT16_MAX;
  static readonly CAMERA = {
    size: 4,
    view: (data: ArrayBuffer) => ({
      camera_id: new Uint16Array(data, 0, 1),
    })
  };

  device: GPUDevice;
  capacity: number;
  entries: Map<EntityName, CameraRef>;
  pool: GPUPool;

  constructor(device: GPUDevice, args?: { capacity?: number; }) {
    this.device = device;
    this.capacity = args?.capacity ?? Cameras.MAX_CAPACITY;
    this.entries = new Map();
    this.pool = new GPUPool(this.device, {
      blockSize: Cameras.CAMERA.size,
      buffer: this.device.createBuffer({
        label: 'cameras',
        size: this.capacity * Cameras.CAMERA.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
    });
  }

  clear() {
    this.entries.clear();
    this.pool.clear();
  }

  get(name: EntityName): CameraRef | undefined {
    return this.entries.get(name);
  }

  set(name: EntityName, camera: Camera) {
    let ref = this.entries.get(name);
    if (ref === undefined) {
      ref = {
        id: this.pool.allocate(),
        projection: mat4.copy(camera.projection),
      };
    } else {
      ref.projection = mat4.copy(camera.projection);
    }
    this.entries.set(name, ref);
    this.write(ref);
    return ref;
  }

  write(ref: CameraRef) {
    const data = new ArrayBuffer(Cameras.CAMERA.size);
    const view = Cameras.CAMERA.view(data);
    view.camera_id[0] = ref.id;
    this.pool.write(ref.id, data);
  }
}