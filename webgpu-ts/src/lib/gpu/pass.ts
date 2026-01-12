export type BindingName = string;

export class GPUPass {
  device: GPUDevice;
  label: string;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  shaderModule: GPUShaderModule;
  constructor(
    device: GPUDevice,
    args: {
      label?: string;
      code?: string;
      bindings: { type: GPUBufferBindingType; buffer: GPUBuffer }[];
    },
  ) {
    this.device = device;
    this.label = args.label ?? "GPUCompute";
    const bindings = args.bindings ?? [];
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: `${this.label} layout`,
      entries: bindings.map(({ type }, i) => ({
        binding: i,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type },
      })),
    });
    this.bindGroup = this.device.createBindGroup({
      label: `${this.label} bind group`,
      layout: this.bindGroupLayout,
      entries: bindings.map(({ buffer }, i) => ({
        binding: i,
        resource: buffer,
      })),
    });
    this.shaderModule = this.device.createShaderModule({
      code: args.code ?? "",
    });
  }
}
