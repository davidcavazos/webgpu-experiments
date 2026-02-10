import { Flatten } from "./passes/flatten";
import type { Stage } from "./stage";
import type { State } from "./start";

export class Renderer {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  stage: Stage;
  passes: {
    flatten: Flatten;
  };

  constructor(device: GPUDevice, args: {
    canvas: HTMLCanvasElement;
    stage: Stage;
  }) {
    this.device = device;
    this.canvas = args.canvas;
    const context = args.canvas.getContext("webgpu");
    if (!context) {
      throw Error("Could not get a WebGPU context.");
    }
    this.context = context;
    this.context.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: "premultiplied",
    });

    this.stage = args.stage;
    this.passes = {
      flatten: new Flatten(this.device, {
        globals: this.stage.globals,
        entities_local: this.stage.entities.local.buffer,
        entities_world_A: this.stage.entities.world_A,
        entities_world_B: this.stage.entities.world_B,
      })
    };
  };

  draw<a>(state: State<a>) {
    const current = state.frameNumber % 2;
    const next = (state.frameNumber + 1) % 2;

    this.stage.writeGlobals();
    const encoder = this.device.createCommandEncoder();
    this.passes.flatten.dispatch(encoder, this.stage.entities.size(), current);
    this.device.queue.submit([encoder.finish()]);

    for (const entity of this.stage.entities) {
    }
  }
}