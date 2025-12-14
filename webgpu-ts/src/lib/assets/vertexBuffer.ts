import { toFixedLength } from "../stdlib";
import { BufferBase, type BufferSlot } from "./bufferBase";

export class VertexBuffer extends BufferBase {
  // Typical GPU cache line size is 128 bytes or 64 bytes.
  // Stride: (position: vec3f, normal: vec3f, uv: vec2f)
  //   (3+3+2)=8 float32 = 32 bytes, aligns well with cache line.
  static readonly stride = (3 + 3 + 2) * Float32Array.BYTES_PER_ELEMENT;
  constructor(device: GPUDevice) {
    super(
      device,
      "VertexBuffer",
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    );
  }

  write(vertices: number[][]): BufferSlot {
    const data = vertices.map((v) => toFixedLength(v, 3 + 3 + 2, 0)).flat();
    return this.writeFloat32(data);
  }
}
