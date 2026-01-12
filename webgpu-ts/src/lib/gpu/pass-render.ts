import { GPUPass } from "./pass";

const defaultVertexBufferLayout: GPUVertexBufferLayout = {
  // position: vec3f, normal: vec3f, uv: vec2f
  arrayStride: (3 + 3 + 2) * Float32Array.BYTES_PER_ELEMENT,
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

export class GPUPassRender extends GPUPass {
  pipeline: GPURenderPipeline;
  constructor(
    device: GPUDevice,
    args: {
      label?: string;
      code?: string;
      bindings: { type: GPUBufferBindingType; buffer: GPUBuffer }[];
      vertex?: Partial<GPUVertexState>;
      fragment?: Partial<GPUFragmentState> | null;
      primitive?: GPUPrimitiveState;
      depthStencil?: GPUDepthStencilState;
      multisample?: GPUMultisampleState;
    },
  ) {
    super(device, args);
    this.pipeline = this.device.createRenderPipeline({
      label: `[render] ${this.label} pipeline`,
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: {
        module: args.vertex?.module ?? this.shaderModule,
        entryPoint: args.vertex?.entryPoint,
        constants: args.vertex?.constants,
        buffers: args.vertex?.buffers ?? [defaultVertexBufferLayout],
      },
      fragment:
        args.fragment === null
          ? undefined
          : {
              module: args.fragment?.module ?? this.shaderModule,
              entryPoint: args.fragment?.entryPoint,
              constants: args.fragment?.constants,
              targets: args.fragment?.targets ?? [
                { format: navigator.gpu.getPreferredCanvasFormat() },
              ],
            },
      primitive: args.primitive,
      depthStencil: args.depthStencil,
      multisample: args.multisample,
    });
  }
}
