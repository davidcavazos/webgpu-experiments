export const defaultShaders = /* wgsl */ `

struct Camera {
  view_projection: mat4x4f,
};
@group(0) @binding(0) var<uniform> camera: Camera;

struct SceneEntity {
// position: Vec3; // i32x3 fixed point in mm
// rotation: Quat; // u32 Smallest-Three Quaternion packing
// scale: number; // f16 half-precision uniform scale
// meshIndex: number; // u16
// materialIndex: number; // u16
// parentIndex: number; // u32
  position: vec3f,
  rotation: u32, // Smallest-Three Quaternion packing
  scale: f32, // TODO: f16
  mesh_material_ids: u32, // mesh_index: u16, material_index: u16
  parent_index: u32,
};
@group(0) @binding(1) var<storage, read> entities: array<SceneEntity>;

// 2 SceneBVH

struct Instance {
  offset: mat4x4f,
};
@group(0) @binding(3) var<storage, read> instances: array<Instance>;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
};

@vertex fn opaque_vertex(
  // @builtin(vertex_index) vertex_index : u32,
  @builtin(instance_index) instance_id: u32,
  input: VertexInput
) -> VertexOutput {
  // var instance = instances[model.instance_offset + instance_id];
  var output: VertexOutput;
  // output.position = camera.view_projection * instance.transform * vec4f(input.position, 1.0);
  // output.normal = input.normal;
  return output;
}

@fragment fn opaque_pixel(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(1, 1, 1, 1);
  // return vec4f(input.normal * 0.5 + 0.5, 1);
}

fn unpackQuat(packed: u32) -> vec4<f32> {
  let max_idx = packed >> 30u;
  let a = f32((packed >> 20u) & 1023u) / 1023.0 * 1.414214 - 0.707107;
  let b = f32((packed >> 10u) & 1023u) / 1023.0 * 1.414214 - 0.707107;
  let c = f32(packed & 1023u) / 1023.0 * 1.414214 - 0.707107;

  let d = sqrt(1.0 - (a*a + b*b + c*c));

  if (max_idx == 0u) { return vec4<f32>(d, a, b, c); }
  if (max_idx == 1u) { return vec4<f32>(a, d, b, c); }
  if (max_idx == 2u) { return vec4<f32>(a, b, d, c); }
  return vec4<f32>(a, b, c, d);
}

`;
