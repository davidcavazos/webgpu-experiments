const threads = 64;

export const flattenCode = /* wgsl */ `

@group(0) @binding(0) var<storage, read> local: array<vec3u>;
@group(0) @binding(1) var<storage, read_write> world: array<vec3u>;
@group(0) @binding(2) var<storage, read_write> bounds: array<vec3u>;
 
@compute @workgroup_size(${threads}) fn flattenScene(
    @builtin(global_invocation_id) id : vec3<u32>,
) {
    let entityIndex = id.x;
}

`;
