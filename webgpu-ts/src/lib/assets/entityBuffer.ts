import type { Entity } from "../scene";
import { toFixedLength } from "../stdlib";
import { BufferBase, type BufferSlot, type ChunkID } from "./bufferBase";

export type EntityBufferSlot = {
  chunk: ChunkID;
  buffer: GPUBuffer;
  offset: number;
  size: number;
  count: number;
};

// export class EntityBuffer extends BufferBase {
//   constructor(device: GPUDevice) {
//     super(
//       device,
//       "EntityBuffer",
//       GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
//     );
//   }

//   write(entities: Entity[]): EntityBufferSlot {
//     const data = entities.flatMap((e) =>
//       toFixedLength([...e.transform], 4 * 4, 0),
//     );
//     return this.writeFloat32(data);
//   }
// }

export class EntityBuffer {
  static readonly stride = 4 * 4 * Float32Array.BYTES_PER_ELEMENT;
  device: GPUDevice;
  size: number;
  buffer: GPUBuffer;
  constructor(device: GPUDevice, size?: number) {
    this.device = device;
    this.size = size ?? device.limits.maxStorageBufferBindingSize;
    this.buffer = device.createBuffer({
      label: `EntityBuffer`,
      size: this.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  write(entities: Entity[]): EntityBufferSlot {
    const data = entities.flatMap((e) =>
      toFixedLength([...e.transform], 4 * 4, 0),
    );
    const slot = {
      chunk: 0,
      buffer: this.buffer,
      offset: 0,
      size: entities.length * EntityBuffer.stride,
      count: entities.length,
    };
    this.device.queue.writeBuffer(
      this.buffer,
      slot.offset,
      new Float32Array(data),
    );
    return slot;
  }
}
