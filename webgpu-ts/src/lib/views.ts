import type { EntityId } from "./entities";
import { GPUPool } from "./gpu/pool";

export class Views {
  static readonly ENTITIES = { size: 4 }; // u32

  device: GPUDevice;
  capacity: number;
  entities: GPUPool;
  pinned: EntityId[];

  constructor(device: GPUDevice, args?: {
    capacity?: number,
  }) {
    this.device = device;
    this.capacity = args?.capacity ?? 256;
    this.entities = new GPUPool(device, {
      blockSize: Views.ENTITIES.size,
      buffer: this.device.createBuffer({
        label: 'views_entities',
        size: this.capacity * Views.ENTITIES.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    this.pinned = [];
  }
}