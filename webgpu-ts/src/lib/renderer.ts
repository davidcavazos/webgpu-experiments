import { Meshes } from "./meshes";
import { Flatten } from "./passes/flatten";
import { shaderCommon } from "./shader/common";
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
  opaque: GPURenderPipeline;

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
    const renderModule = this.device.createShaderModule({
      code: renderCode,
    });
    this.opaque = this.device.createRenderPipeline({
      label: 'opaque',
      layout: this.device.createPipelineLayout({
        label: 'opaque',
        bindGroupLayouts: [
        ],
      }),
      vertex: {
        module: renderModule,
        entryPoint: 'opaque_vertex',
        buffers: [
          {
            arrayStride: Meshes.GEOMETRY_VERTEX.size,
            attributes: Meshes.GEOMETRY_VERTEX.attributes,
          },
        ],
      },
      fragment: {
        module: renderModule,
        entryPoint: 'opaque_fragment',
        targets: [{
          format: this.context.getCurrentTexture().format,
        }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
    });
  };

  draw<a>(state: State<a>) {
    const current = state.frameNumber % 2;
    const next = (state.frameNumber + 1) % 2;

    this.stage.writeGlobals();
    const encoder = this.device.createCommandEncoder();
    this.passes.flatten.dispatch(encoder, this.stage.entities.size(), current);
    this.device.queue.submit([encoder.finish()]);

    for (const [name, ref] of this.stage.entities) {
    }
  }
}

const renderCode = /* wgsl */`

${shaderCommon}

// @group(0) @binding(0) var<uniform> camera: Camera;
// @group(0) @binding(1) var<storage, read> entities_world: array<EntityWorld>;
// @group(0) @binding(2) var<storage, read> instances: array<EntityId>;

@vertex fn opaque_vertex(
  @builtin(vertex_index) vertex_id : u32,
  @builtin(instance_index) instance_id: u32,
  input: VertexInput
) -> VertexOutput {
  // let entity_index = instances[instance_id];
  // let entity_world = entities_world[entity_index];
  // let position = entity_world.position_scale.xyz;
  // let scale = entity_world.position_scale.w;
  // let rotation = entity_world.rotation;
  // let world_matrix = transform_matrix(position, rotation, scale);
  var output: VertexOutput;
  // output.position = camera.view_projection * world_matrix * vec4f(input.position, 1.0);
  output.position = vec4f(input.position, 1.0);
  output.normal = vec3f(input.normal);
  return output;
}

@fragment fn opaque_fragment(input: VertexOutput) -> @location(0) vec4f {
  // return vec4f(input.normal * 0.5 + 0.5, 1);
  return vec4f(input.normal, 1);
}

`;