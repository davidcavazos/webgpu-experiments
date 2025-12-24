import { mat4 } from "../mat4";

export class Globals {
  static readonly viewProjectionSize = 4 * 4 * Float32Array.BYTES_PER_ELEMENT;
  static readonly size = Globals.viewProjectionSize;

  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
  $arrayBuffer: ArrayBuffer;
  projection: Float32Array;
  viewProjection: Float32Array;
  constructor(device: GPUDevice) {
    this.device = device;
    this.buffer = this.device.createBuffer({
      label: "Globals",
      size: Globals.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.$arrayBuffer = new ArrayBuffer(Globals.size);
    this.projection = mat4.perspective(100, 1, 1, 1000);
    this.viewProjection = new Float32Array(this.$arrayBuffer, 0, 4 * 4);
  }

  writeBuffer() {
    this.device.queue.writeBuffer(this.buffer, 0, this.$arrayBuffer);
  }
}
