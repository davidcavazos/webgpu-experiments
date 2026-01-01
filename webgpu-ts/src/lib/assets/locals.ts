export class Locals {
  static readonly entityOffset = Uint32Array.BYTES_PER_ELEMENT;
  static readonly size = Locals.entityOffset;

  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
  $arrayBuffer: ArrayBuffer;
  entityOffset: Uint32Array;
  constructor(device: GPUDevice) {
    this.device = device;
    this.buffer = this.device.createBuffer({
      label: "Globals",
      size: Locals.size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.$arrayBuffer = new ArrayBuffer(Locals.size);
    this.entityOffset = new Uint32Array(this.$arrayBuffer, 0, 1);
  }

  writeBuffer(args: { entityOffset: number }) {
    this.entityOffset.set([args.entityOffset]);
    this.device.queue.writeBuffer(this.buffer, 0, this.$arrayBuffer);
  }
}
