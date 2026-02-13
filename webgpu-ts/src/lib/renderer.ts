import { mat4 } from "wgpu-matrix";
import { Meshes } from "./meshes";
import { Flatten } from "./passes/flatten";
import { shaderCommon } from "./shader/common";
import type { Stage } from "./stage";
import type { State } from "./start";
import { RenderColor, type DrawCmd } from "./renderColor";

export class Renderer {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  stage: Stage;
  pass: {
    flatten: Flatten;
    opaque: RenderColor;
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
    this.pass = {
      flatten: new Flatten(this.device, {
        globals: this.stage.globals,
        entities_local: this.stage.entities.local.buffer,
        entities_world_A: this.stage.entities.world_A,
        entities_world_B: this.stage.entities.world_B,
      }),
      opaque: new RenderColor(this.device, {
        label: 'opaque',
        textureFormat: this.context.getCurrentTexture().format,
        vertex_buffer: this.stage.entities.meshes.geometry.buffer,
        index_buffer: this.stage.entities.meshes.geometry.buffer,
      }),
    };
  };

  draw<a>(state: State<a>) {
    const current = state.frameNumber % 2;
    const prev = Number(!current);

    this.stage.writeGlobals();
    const encoder = this.device.createCommandEncoder();
    this.pass.flatten.dispatch(encoder, this.stage.entities.size(), current);

    // TODO: this should all be done in compute passes.
    const draws = this.TODO();

    this.pass.opaque.draw({
      encoder,
      textureView: this.context.getCurrentTexture().createView(),
      draws,
    });
    this.device.queue.submit([encoder.finish()]);
  }

  TODO(): DrawCmd[] {
    for (const [camera, viewport] of this.stage.viewports) {
      // TODO: multiply projection by view matrix.
      // - The transform is on the GPU only, so must be done in shader pass.
      this.stage.views.set(camera.entity, {
        view_projection: camera.projection,
        pinned: true,
      });
    }
    const draws: DrawCmd[] = [];
    for (const ref of this.stage.entities) {
      if (ref.mesh === undefined) {
        continue;
      }
      const mesh = this.stage.entities.meshes.entries.get(ref.mesh);
      if (mesh?.geometry === undefined) {
        continue;
      }
      draws.push({
        indexCount: mesh.geometry.lod0.indexCount,
        instanceCount: 1,
        firstIndex: mesh.geometry.lod0.firstIndex,
        baseVertex: mesh.geometry.baseVertex,
        firstInstance: 0,
      });
    }
    return draws;
  }

  resizeViewports() {
    this.stage.resizeViewports(this.canvas.width, this.canvas.height);
  }
}

const renderCode = /* wgsl */`

${shaderCommon}

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> entities_world: array<EntityWorld>;
@group(0) @binding(2) var<storage, read> instances: array<EntityId>;

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
  // let entity_id = instances[instance_id];
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