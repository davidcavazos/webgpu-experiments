import { BufferBase, type BufferSlot } from "./bufferBase";

export class IndexBuffer extends BufferBase {
  constructor(device: GPUDevice) {
    super(
      device,
      "IndexBuffer",
      GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    );
  }

  write(indices: number[]): BufferSlot {
    const maxIndex = Math.max(...indices);
    if (maxIndex <= 0xff) {
      return this.writeUInt8(indices);
    }
    if (maxIndex <= 0xffff) {
      return this.writeUInt16(indices);
    }
    return this.writeUInt32(indices);
  }
}
