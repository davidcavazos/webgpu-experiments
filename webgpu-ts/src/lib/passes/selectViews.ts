import { shaderCommon } from "../shader/common";

const WORKGROUP_SIZE = 64;
const BIND = {
  globals: 0,
  entities_world: 1,
  entities_view: 2,
  cameras: 3,
  views: 4,
};

export class SelectViews {
  label: string;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: [GPUBindGroup, GPUBindGroup];
  pipeline: GPUComputePipeline;

  constructor(device: GPUDevice, args: {
    globals: GPUBuffer,
    entities_world_A: GPUBuffer,
    entities_world_B: GPUBuffer,
    entities_view: GPUBuffer,
    cameras: GPUBuffer,
    views: GPUBuffer,
  }) {
    this.label = 'select_views';
    this.bindGroupLayout = device.createBindGroupLayout({
      label: this.label,
      entries: [
        { binding: BIND.globals, buffer: { type: 'uniform' }, visibility: GPUShaderStage.COMPUTE },
        { binding: BIND.entities_world, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE },
        { binding: BIND.entities_view, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE },
        { binding: BIND.cameras, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE },
        { binding: BIND.views, buffer: { type: 'storage' }, visibility: GPUShaderStage.COMPUTE },
      ],
    });
    this.bindGroup = [
      device.createBindGroup({
        label: `${this.label}_A`,
        layout: this.bindGroupLayout,
        entries: [
          { binding: BIND.globals, resource: args.globals },
          { binding: BIND.entities_world, resource: args.entities_world_A },
          { binding: BIND.entities_view, resource: args.entities_view },
          { binding: BIND.cameras, resource: args.cameras },
          { binding: BIND.views, resource: args.views },
        ],
      }),
      device.createBindGroup({
        label: `${this.label}_B`,
        layout: this.bindGroupLayout,
        entries: [
          { binding: BIND.globals, resource: args.globals },
          { binding: BIND.entities_world, resource: args.entities_world_B },
          { binding: BIND.entities_view, resource: args.entities_view },
          { binding: BIND.cameras, resource: args.cameras },
          { binding: BIND.views, resource: args.views },
        ],
      }),
    ];
    this.pipeline = device.createComputePipeline({
      label: this.label,
      layout: device.createPipelineLayout({
        label: this.label,
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      compute: {
        module: device.createShaderModule({
          label: this.label,
          code,
        }),
      }
    });
  }

  dispatch(encoder: GPUCommandEncoder, args: {
    views_size: number,
    current: number,
  }) {
    const pass = encoder.beginComputePass({ label: this.label });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup[args.current]);
    pass.dispatchWorkgroups(Math.ceil(args.views_size / WORKGROUP_SIZE));
    pass.end();
  }
}

// ---- START SHADER CODE ---- \\
const code = /* wgsl */ `

${shaderCommon}

@group(0) @binding(${BIND.globals}) var<uniform> globals: Globals;
@group(0) @binding(${BIND.entities_world}) var<storage> entities_world: array<EntityWorld>;
@group(0) @binding(${BIND.entities_view}) var<storage> entities_view: array<EntityView>;
@group(0) @binding(${BIND.cameras}) var<storage> cameras: array<Camera>;
@group(0) @binding(${BIND.views}) var<storage, read_write> views: array<View>;

@compute @workgroup_size(${WORKGROUP_SIZE}) fn select_views(
  @builtin(global_invocation_id) global_id: vec3<u32>,
) {
  let view_id = global_id.x;
  if (view_id >= globals.views_size) {
    return;
  }

  let view = views[view_id];
  let entity_world = entities_world[view.entity_id];
  let entity_view = entities_view[view.entity_id];
  let camera = cameras[entity_view.camera_id];
  let position = entity_world.position;
  let rotation = Quat(entity_world.rotation);

  let view_matrix = mat4_translate(mat4_from_quat(quat_inverse(rotation)), -position);
  let fov_rad = 2 * atan(1 / camera.projection[0][1]);
  let lod = 0u;
  let flags = view._pack_lod_flags & 0xFFFF;

  views[view_id]._pack_lod_flags = (lod << 16) | flags;
  views[view_id].direction = vec3<f16>(get_direction_vec(rotation));
  views[view_id].world_position = position;
  views[view_id].size_culling_k = get_size_culling_k(globals.screen_height, fov_rad);
  views[view_id].frustum[0] = get_frustum_left(camera.projection);
  views[view_id].frustum[1] = get_frustum_right(camera.projection);
  views[view_id].frustum[2] = get_frustum_bottom(camera.projection);
  views[view_id].frustum[3] = get_frustum_top(camera.projection);
  views[view_id].frustum[4] = get_frustum_near(camera.projection);
  views[view_id].frustum[5] = get_frustum_far(camera.projection);
  views[view_id].view_projection = camera.projection * view_matrix;
//   views[view_id].view_projection = mat4x4f();
//   inverse_view_projection: mat4x4f,
}

fn get_direction_vec(quat: Quat) -> vec3f {
  let forward = vec3f(0, 0, -1);
  return vec3_transform_quat(forward, quat);
}

fn get_size_culling_k(screen_height: u32, fov_rad: f32) -> f32 {
  return 0.5 * f32(screen_height) / tan(0.5 * fov_rad);
}

fn get_frustum_left(m: mat4x4f) -> vec4f {
  return get_frustum_plane_add(m, 0);
}
fn get_frustum_right(m: mat4x4f) -> vec4f {
  return get_frustum_plane_sub(m, 0);
}
fn get_frustum_bottom(m: mat4x4f) -> vec4f {
  return get_frustum_plane_add(m, 1);
}
fn get_frustum_top(m: mat4x4f) -> vec4f {
  return get_frustum_plane_sub(m, 1);
}
fn get_frustum_near(m: mat4x4f) -> vec4f {
  let plane = vec4f(m[0][2], m[1][2], m[2][2], m[3][2]);
  let magnitude = length(plane);
  return plane * (1 / magnitude);
}
fn get_frustum_far(m: mat4x4f) -> vec4f {
  return get_frustum_plane_sub(m, 2);
}

fn get_frustum_plane_add(m: mat4x4f, col: u32) -> vec4f {
  let plane = vec4f(
    m[0][3] + m[0][col],
    m[1][3] + m[1][col],
    m[2][3] + m[2][col],
    m[3][3] + m[3][col],
  );
  let magnitude = length(plane);
  return plane * (1 / magnitude);
}

fn get_frustum_plane_sub(m: mat4x4f, col: u32) -> vec4f {
  let plane = vec4f(
    m[0][3] - m[0][col],
    m[1][3] - m[1][col],
    m[2][3] - m[2][col],
    m[3][3] - m[3][col],
  );
  let magnitude = length(plane);
  return plane * (1 / magnitude);
}

`;
