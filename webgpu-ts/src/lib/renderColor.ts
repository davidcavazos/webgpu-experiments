import { Meshes } from "./meshes";
import { shaderCommon } from "./shader/common";

export interface DrawCmd {
  indexCount: number;
  instanceCount: number;
  firstIndex: number;
  baseVertex: number;
  firstInstance: number;
}

const BIND = {
  globals: 0,
  instances: 1,
  entities_world: 2,
};

export class RenderColor {
  device: GPUDevice;
  module: GPUShaderModule;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: [GPUBindGroup, GPUBindGroup];
  pipeline: GPURenderPipeline;
  vertex_buffer: GPUBuffer;
  index_buffer: GPUBuffer;

  constructor(device: GPUDevice, args: {
    label?: string;
    module?: GPUShaderModule;
    vertex_buffer: GPUBuffer;
    index_buffer: GPUBuffer;
    globals: GPUBuffer;
    instances: GPUBuffer;
    entities_world_A: GPUBuffer;
    entities_world_B: GPUBuffer;
    textureFormat: GPUTextureFormat;
  }) {
    this.device = device;
    this.vertex_buffer = args.vertex_buffer;
    this.index_buffer = args.index_buffer;
    this.module = args.module ?? this.device.createShaderModule({
      label: args.label,
      code: defaultCode,
    });
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: args.label,
      entries: [
        { binding: BIND.globals, buffer: { type: 'uniform' }, visibility: GPUShaderStage.VERTEX },
        { binding: BIND.instances, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.VERTEX },
        { binding: BIND.entities_world, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.VERTEX },
      ],
    });
    this.bindGroup = [
      this.device.createBindGroup({
        label: `${args.label}_A`,
        layout: this.bindGroupLayout,
        entries: [
          { binding: BIND.globals, resource: args.globals },
          { binding: BIND.instances, resource: args.instances },
          { binding: BIND.entities_world, resource: args.entities_world_A },
        ],
      }),
      this.device.createBindGroup({
        label: `${args.label}_B`,
        layout: this.bindGroupLayout,
        entries: [
          { binding: BIND.globals, resource: args.globals },
          { binding: BIND.instances, resource: args.instances },
          { binding: BIND.entities_world, resource: args.entities_world_B },
        ],
      }),
    ];
    this.pipeline = this.device.createRenderPipeline({
      label: args.label,
      layout: this.device.createPipelineLayout({
        label: args.label,
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: {
        module: this.module,
        entryPoint: 'opaque_vertex',
        buffers: [
          {
            arrayStride: Meshes.GEOMETRY_VERTEX.size,
            attributes: Meshes.GEOMETRY_VERTEX.attributes,
          },
        ],
      },
      fragment: {
        module: this.module,
        entryPoint: 'opaque_fragment',
        targets: [{
          format: args.textureFormat,
        }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
    });
  }

  draw(encoder: GPUCommandEncoder, args: {
    textureView: GPUTextureView;
    current: number;
    draws: DrawCmd[];
  }) {
    const pass = encoder.beginRenderPass({
      label: 'opaque',
      colorAttachments: [{
        view: args.textureView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.vertex_buffer);
    pass.setIndexBuffer(this.index_buffer, Meshes.GEOMETRY_INDEX.format);
    pass.setBindGroup(0, this.bindGroup[args.current]);
    // TODO: drawIndexedIndirect with fixed render bundle (eg. 4096 draws, some with instanceCount=0).
    for (const draw of args.draws) {
      pass.drawIndexed(
        draw.indexCount,
        draw.instanceCount,
        draw.firstIndex,
        draw.baseVertex,
        draw.firstInstance,
      );
    }
    pass.end();
  }
}

// ---- START SHADER CODE ---- \\
const defaultCode = /* wgsl */`

${shaderCommon}

@group(0) @binding(${BIND.globals}) var<uniform> globals: Globals;
@group(0) @binding(${BIND.instances}) var<storage, read> instances: array<EntityId>;
@group(0) @binding(${BIND.entities_world}) var<storage, read> entities_world: array<EntityWorld>;

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001000a01000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6cd12bb77ae4df8a541430a62ceaa7a28e236f1ecf27ebbf8baf2dd0c87683f1d45382f492f7500ab40c37e99189de5f8fe963927340abfab3fea597fad52ec74c368723453ef9d30836947c5209e7ce1a9aaadc03120146d64a47c2f2f2ea6b578b302df1b6361dfd53388c2551c8b4e826d59d166017ae06c9e339f2ae3f598c9e81da7cba7edac13d280f5fff0f011a00
struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f16>,
  @location(2) uv: vec2<f16>,
};

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d00000100ec00000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6cd12bb77ae4dfd8a046020b17bcf2f27cfcc4a63276e5601913013a15c3e8385704d2349ea7fceeb3a0456d3b02555e0d5f400f59b0a799ffc6075a4e258a53ba03261e64c950686943e6835c1fa03297f3ac851c0125073a2c790c854f757d1fc7f78da8e22d94c0deb96498f9de9560a6c936b9a95b18d54176a3331c3185f905584ff404db463e3ffff0302800
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
};

@vertex fn opaque_vertex(
  @builtin(vertex_index) vertex_id: u32,
  @builtin(instance_index) instance_id: u32,
  input: VertexInput
) -> VertexOutput {
  let entity_id = instances[instance_id];
  // let entity_index = instances[instance_id];
  // let entity_world = entities_world[entity_index];
  // let position = entity_world.position_scale.xyz;
  // let scale = entity_world.position_scale.w;
  // let rotation = entity_world.rotation;
  // let world_matrix = transform_matrix(position, rotation, scale);
  var output: VertexOutput;
  // output.position = camera.view_projection * world_matrix * vec4f(input.position, 1.0);
  var pos = array<vec2f, 3>(
    vec2f(0.0, 0.5),
    vec2f(-0.5, -0.5),
    vec2f(0.5, -0.5)
  );

  output.position = vec4f(pos[vertex_id % 3], 0.0, 1.0);
  output.normal = vec3f(input.normal);
  return output;
}

@fragment fn opaque_fragment(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(input.normal * 0.5 + 0.5, 1);
}

`;