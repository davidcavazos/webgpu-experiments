import { toFixedLength } from "../stdlib";
import { BufferBase } from "./bufferBase";

export type LightBufferSlot = {
  buffer: GPUBuffer;
  offset: number;
  size: number;
};

export class LightBuffer extends BufferBase {
  readonly buffer: GPUBuffer;
  constructor(device: GPUDevice) {
    const label = "LightBuffer";
    super(
      device,
      label,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      device.limits.maxUniformBufferBindingSize,
    );
    this.buffer = this.device.createBuffer({
      label,
      size: this.chunkSize,
      usage: this.usage,
    });
    this.chunks = [this.buffer];
    this.clear();
  }

  // TODO: rework this
  write(matrix: Float32Array): LightBufferSlot {
    const data = toFixedLength([...matrix], 4 * 4, 0);
    const slot = this.writeFloat32(data);
    if (slot.chunk !== 0) {
      throw new Error("Max lights reached");
    }
    return {
      buffer: slot.buffer,
      offset: slot.offset,
      size: slot.size,
    };
  }
}
