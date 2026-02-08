import type { Stage } from "./stage";

export class Renderer {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  constructor(device: GPUDevice, args: {
    canvas: HTMLCanvasElement;
  }) {
    this.device = device;
    this.canvas = args.canvas;
  }

  draw(stage: Stage) {
  }
}