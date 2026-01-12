import { shaderCommon } from "./common";

export const shaderRender = /* wgsl */ `

${shaderCommon}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> entities_world: array<EntityWorld>;
@group(0) @binding(2) var<storage, read> instances: array<EntityIndex>;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
};

@vertex fn vertex(
  @builtin(vertex_index) vertex_index : u32,
  @builtin(instance_index) instance_id: u32,
  input: VertexInput
) -> VertexOutput {
  let entity_index = instances[instance_id];
  let entity_world = entities_world[entity_index];
  let position = entity_world.position_scale.xyz;
  let scale = entity_world.position_scale.w;
  let rotation = entity_world.rotation;
  let world_matrix = transform_matrix(position, rotation, scale);
  var output: VertexOutput;
  output.position = camera.view_projection * world_matrix * vec4f(input.position, 1.0);
  output.normal = input.normal;
  return output;
}

@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  // return vec4f(input.normal * 0.5 + 0.5, 1);
  return vec4f(input.normal, 1);
}

`;
