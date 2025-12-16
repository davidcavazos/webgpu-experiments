import { BufferBase, type ChunkID } from "./bufferBase";

export type IndexBufferSlot = {
  chunk: ChunkID;
  buffer: GPUBuffer;
  offset: number;
  size: number;
  count: number;
  format: GPUIndexFormat;
};

export class IndexBuffer extends BufferBase {
  constructor(device: GPUDevice) {
    super(
      device,
      "IndexBuffer",
      GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    );
  }

  write(indices: number[]): IndexBufferSlot {
    // In WebGPU, only uint16 or uint32 are valid GPUIndexFormat
    const maxIndex = Math.max(...indices);
    // if (maxIndex <= 0xff) {
    //   return this.writeUInt8(indices);
    // }
    if (maxIndex <= 0xffff) {
      const slot = this.writeUInt16(indices);
      return { ...slot, count: indices.length, format: "uint16" };
    }
    const slot = this.writeUInt32(indices);
    return { ...slot, count: indices.length, format: "uint32" };
  }
}
