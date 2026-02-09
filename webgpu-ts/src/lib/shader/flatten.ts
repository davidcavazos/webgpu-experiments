import { shaderCommon } from "./common";

export const shaderFlatten = /* wgsl */ `

${shaderCommon}

@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> entities_local: array<EntityLocal>;
@group(0) @binding(2) var<storage, read_write> entities_world: array<EntityWorld>;

@compute @workgroup_size(64) fn flatten(
  @builtin(global_invocation_id) id: vec3<u32>,
) {
  let entity_idx = id.x;
  if (entity_idx >= globals.entities_size) {
    return;
  // let entity_local = entities_local[entity_index];
  }
}

`;
