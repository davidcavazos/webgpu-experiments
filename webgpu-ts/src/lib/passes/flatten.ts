import { shaderCommon } from "../shader/common";

const WORKGROUP_SIZE = 64;
const BIND = {
  globals: 0,
  entities_local: 1,
  entities_world: 2,
};

// ---- START SHADER CODE ---- \\
const code = /* wgsl */ `

${shaderCommon}

@group(0) @binding(${BIND.globals}) var<uniform> globals: Globals;

@group(0) @binding(${BIND.entities_local}) var<storage, read> entities_local: array<EntityLocal>;
@group(0) @binding(${BIND.entities_world}) var<storage, read_write> entities_world: array<EntityWorld>;

@compute @workgroup_size(${WORKGROUP_SIZE}) fn flatten(
  @builtin(global_invocation_id) global_id: vec3<u32>,
) {
  let entity_idx = global_id.x;
  if (entity_idx >= globals.entities_size) {
    return;
  }
  let local = entities_local[entity_idx];
  if (is_sleep(local.flags)) {
    return;
  }
  entities_world[entity_idx].position = local.position;
  entities_world[entity_idx].scale = local.scale;
  entities_world[entity_idx].rotation = local.rotation;
  entities_world[entity_idx].morton_code = get_morton_code(local.position);
  entities_world[entity_idx].flags = local.flags;
}

fn get_morton_code(pos: vec3f) -> u32 {
  let morton_scale = 1024.0; // 10 bits per axis
  let x = u32(pos.x * morton_scale);
  let y = u32(pos.y * morton_scale);
  let z = u32(pos.z * morton_scale);
  return (x & 0x3FF) | ((y & 0x3FF) << 10u) | ((z & 0x3FF) << 20u);
}

`;
// ---- END SHADER CODE ---- \\

export class Flatten {
  label: string;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: [GPUBindGroup, GPUBindGroup];
  pipeline: GPUComputePipeline;

  constructor(device: GPUDevice, args: {
    globals: GPUBuffer,
    entities_local: GPUBuffer,
    entities_world_A: GPUBuffer,
    entities_world_B: GPUBuffer,
  }) {
    this.label = 'flatten';
    this.bindGroupLayout = device.createBindGroupLayout({
      label: this.label,
      entries: [
        { binding: BIND.globals, buffer: { type: 'uniform' }, visibility: GPUShaderStage.COMPUTE },
        { binding: BIND.entities_local, buffer: { type: 'read-only-storage' }, visibility: GPUShaderStage.COMPUTE },
        { binding: BIND.entities_world, buffer: { type: 'storage' }, visibility: GPUShaderStage.COMPUTE },
      ],
    });
    this.bindGroup = [
      device.createBindGroup({
        label: `${this.label}_A`,
        layout: this.bindGroupLayout,
        entries: [
          { binding: BIND.globals, resource: args.globals },
          { binding: BIND.entities_local, resource: args.entities_local },
          { binding: BIND.entities_world, resource: args.entities_world_A },
        ],
      }),
      device.createBindGroup({
        label: `${this.label}_B`,
        layout: this.bindGroupLayout,
        entries: [
          { binding: BIND.globals, resource: args.globals },
          { binding: BIND.entities_local, resource: args.entities_local },
          { binding: BIND.entities_world, resource: args.entities_world_B },
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

  dispatch(encoder: GPUCommandEncoder, entities_size: number, current: number) {
    const pass = encoder.beginComputePass({ label: this.label });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup[current]);
    pass.dispatchWorkgroups(Math.ceil(entities_size / WORKGROUP_SIZE));
    pass.end();
  }
}
