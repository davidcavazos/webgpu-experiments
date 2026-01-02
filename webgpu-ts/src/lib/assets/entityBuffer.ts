import type { Entity } from "../entity";
import { toFixedLength } from "../stdlib";
import { BufferBase } from "./bufferBase";

export type EntityBufferSlot = {
  buffer: GPUBuffer;
  offset: number;
  size: number;
  count: number;
};

export class EntityBuffer extends BufferBase {
  static readonly stride = 4 * 4 * Float32Array.BYTES_PER_ELEMENT;
  readonly buffer: GPUBuffer;
  constructor(device: GPUDevice) {
    super(
      device,
      "EntityBuffer",
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      device.limits.maxStorageBufferBindingSize,
    );
    this.buffer = this.device.createBuffer({
      label: "EntityBuffer",
      size: this.chunkSize,
      usage: this.usage,
    });
    this.chunks = [this.buffer];
    this.clear();
  }

  write(entities: Entity[]): EntityBufferSlot {
    const data = entities.flatMap((e) =>
      toFixedLength([...e.transform.matrix], 4 * 4, 0),
    );
    const slot = this.writeFloat32(data);
    if (slot.chunk !== 0) {
      throw new Error("Max entities reached");
    }
    return {
      buffer: slot.buffer,
      offset: slot.offset,
      size: slot.size,
      count: entities.length,
    };
  }
}
