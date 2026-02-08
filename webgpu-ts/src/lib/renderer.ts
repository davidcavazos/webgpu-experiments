import type { EntityId } from "./entities";
import { shaderFlatten } from "./shader/flatten";
import type { Stage } from "./stage";
import type { State } from "./start";

export class Renderer {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  stage: Stage;
  bindGroupLayouts: {
    flatten: GPUBindGroupLayout;
  };
  bindGroups: {
    flatten: [GPUBindGroup, GPUBindGroup];
  };
  pipelines: {
    flatten: GPUComputePipeline;
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
    this.bindGroupLayouts = {
      flatten: this.flatten_bindGroupLayout(),
    };
    this.pipelines = {
      flatten: this.flatten_pipeline(),
    };
    this.bindGroups = {
      flatten: this.flatten_bindGroup(),
    };
  };

  draw<a>(state: State<a>) {
    const pingPong = state.frameNumber % 2;
    this.stage.writeGlobals();
    const encoder = this.device.createCommandEncoder();
    this.flatten_dispatch(encoder, pingPong);
    this.device.queue.submit([encoder.finish()]);
  }

  // Compute: flatten
  flatten_bindGroupLayout(): GPUBindGroupLayout {
    return this.device.createBindGroupLayout({
      label: `flatten`,
      entries: [
        { binding: 0, buffer: { type: 'uniform' }, visibility: GPUShaderStage.COMPUTE },
        { binding: 1, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE },
        { binding: 2, buffer: { type: 'storage' }, visibility: GPUShaderStage.COMPUTE },
      ],
    });
  }
  flatten_bindGroup(): [GPUBindGroup, GPUBindGroup] {
    const groupA = this.device.createBindGroup({
      label: 'flatten A',
      layout: this.pipelines.flatten.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.stage.globals },
        { binding: 1, resource: this.stage.entities.local.buffer },
        { binding: 2, resource: this.stage.entities.world_A },
      ],
    });
    const groupB = this.device.createBindGroup({
      label: 'flatten B',
      layout: this.pipelines.flatten.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.stage.globals },
        { binding: 1, resource: this.stage.entities.local.buffer },
        { binding: 2, resource: this.stage.entities.world_B },
      ],
    });
    return [groupA, groupB];
  }
  flatten_pipeline(): GPUComputePipeline {
    return this.device.createComputePipeline({
      label: 'flatten',
      layout: this.device.createPipelineLayout({
        label: 'flatten',
        bindGroupLayouts: [this.bindGroupLayouts.flatten],
      }),
      compute: {
        module: this.device.createShaderModule({
          label: 'flatten',
          code: shaderFlatten,
        })
      },
    });
  }
  flatten_dispatch(encoder: GPUCommandEncoder, pingPong: number) {
    const pass = encoder.beginComputePass({ label: 'flatten' });
    pass.setPipeline(this.pipelines.flatten);
    pass.setBindGroup(0, this.bindGroups.flatten[pingPong]);
    pass.dispatchWorkgroups(Math.ceil(this.stage.entities.size() / 64));
    pass.end();
  }
}