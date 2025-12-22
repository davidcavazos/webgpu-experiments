import { toFixedLength } from "../stdlib";
import { BufferBase, type BufferSlot } from "./bufferBase";

export type VertexBufferSlot = BufferSlot;

export class VertexBuffer extends BufferBase {
  // Typical GPU cache line size is 128 bytes or 64 bytes.
  // Stride: (position: vec3f, normal: vec3f, uv: vec2f)
  //   (3+3+2)=8 float32 = 32 bytes, aligns well with cache line.
  static readonly stride = 3 + 3 + 2;
  static readonly layout: GPUVertexBufferLayout = {
    arrayStride: VertexBuffer.stride * Float32Array.BYTES_PER_ELEMENT,
    attributes: [
      {
        // Position
        shaderLocation: 0,
        offset: 0,
        format: "float32x3",
      },
      {
        // Normal
        shaderLocation: 1,
        offset: 3 * Float32Array.BYTES_PER_ELEMENT,
        format: "float32x3",
      },
      {
        // UV
        shaderLocation: 2,
        offset: (3 + 3) * Float32Array.BYTES_PER_ELEMENT,
        format: "float32x2",
      },
    ],
  };

  constructor(device: GPUDevice) {
    super(
      device,
      "VertexBuffer",
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    );
  }

  write(vertices: number[][]): VertexBufferSlot {
    const data = vertices
      .map((v) => toFixedLength(v, VertexBuffer.stride, 0))
      .flat();
    return this.writeFloat32(data);
  }
}
