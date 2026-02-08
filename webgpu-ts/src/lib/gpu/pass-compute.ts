import { GPUPass } from "./pass";

export class GPUComputePass extends GPUPass {
  pipeline: GPUComputePipeline;
  constructor(
    device: GPUDevice,
    args: {
      label?: string;
      code?: string;
      bindings: {
        type: GPUBufferBindingType;
        buffer: GPUBuffer;
      }[];
      compute?: GPUProgrammableStage;
    },
  ) {
    super(device, {
      ...args,
      bindings: args.bindings.map((binding) => ({
        ...binding,
        visibility: GPUShaderStage.COMPUTE,
      })),
    });
    this.pipeline = this.device.createComputePipeline({
      label: `[compute] ${this.label} pipeline`,
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      compute: {
        module: args.compute?.module ?? this.shaderModule,
        entryPoint: args.compute?.entryPoint,
        constants: {
          ...args.compute?.constants,
        },
      },
    });
  }

  dispatch(
    encoder: GPUCommandEncoder,
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number,
  ) {
    const pass = encoder.beginComputePass({ label: this.label });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);
    pass.end();
  }
}
