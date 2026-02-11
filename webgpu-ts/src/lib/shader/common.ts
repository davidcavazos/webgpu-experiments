export const shaderCommon = /* wgsl */ `

enable f16;

// https://reingd.substack.com/p/animation-compression

alias Quat = vec4f;

struct Globals {
  entities_size: u32,
};

// // TODO: optimize packing to 16 bytes
// // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001001901000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6cd12bb77ae4df8a541430a62ceaa7a28e236f1ecf27ebbf8baf2dd0c87683f1d45386f2313fccb76ba6d2280f33570a99caa06e11a6c19659999a3dd7dd5c22fc6d7e69fae93d2b0b2d426149b164aaa43cd9098286ea1ffd24056741344726a8b1da9e7502c14470e4d0c9d629c487235edd13f152a52ce1b72c2585943a2a609ed909fb2a0023f6907b60707504d7df3ab123442e9f924079055d746a7e9ffe491296
// struct VertexInput {
//   @location(0) position_quantized: vec2<u32>,
//   @location(1) normal_octahedral: u32,
//   @location(2) uv: vec2<f16>,
// };

alias EntityId = u32;

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001000001000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c35c7a3a1cbc54b3eb16a2bbef5804c9e0103e694e7446ffab06605762d90b036f34effb09a2f69af6ccaa7d91ac4bba574a0e893af33564b7a793b8cfd7c76856412dff404392c1f8d348626d01a08cb84bbd597fde188effe84fada3063e8284e8f01730a7902ea332929710e0ffeafd4754c0e9ab00efbb51e55edc3753bb0f9be4e69b611d0e7fbcf29616284ed2716063ffe145a6a
struct EntityLocal {
  position: vec3f,
  scale: f32,
  rotation: vec4<f16>,
  parent_id: u32,
  flags: u32,
};
const FLAGS_SLEEP  = 1 << 0;
const FLAGS_OPAQUE = 1 << 1;
fn is_sleep(flags: u32) -> bool {
  return (flags & FLAGS_SLEEP) != 0;
}
fn is_opaque(flags: u32) -> bool {
  return (flags & FLAGS_OPAQUE) != 0;
}

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001000201000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c35c7a3a1cbc6af8c694aebd940592d9ce05feeb189d5b416cc41a18d80e107a412514fb7d6253fc69bcbc648e8bc938b6fe86e3983b6f8b44346ba58f0cf27b3bdf2580f110bfd206f78c896a418d28566b4559cbb6ebdab89f0364c396c1d313b25db0992448cf181265afb56d49f7ac4c6daac2ffaac2c8ab03b537849b2ef7f34f7b529f6c27d5005479f06644a3a51b7f3fff375f22a
struct EntityWorld {
  position: vec3f,
  scale: f32,
  rotation: vec4<f16>,
  morton_code: u32,
  flags: u32,
};

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d00000100d000000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c35c7a3a1cbc4075a9de2f64eed23c38f74bcd087f2fd447185f21e3b9f3e6cf38930abc114ae8e1352e1cf62d16adf6b59aa46b8e65bf8d8be12e1fe0c64302987163da012947df65c503899810408370d765930d973bf24c6f90743ab68a3c40b962cca6f889b9e9f22894aed5ba6afb7f1a2d0ffff6ccc0000
struct EntityBounds {
  min: vec3f,
  scale: f32,
  max: vec3f,
}

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001004d01000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c7df5a77636059cbd59ca89d90298a2affa7bbb460db73fa63d127887492c476bab67adb081c499e0c7046f903582183cf8e7ee1ff95b36d085887fc6d1033f3ec46a18aa67fc6eba83dc31bd7846a04ee2f6ac6351705ec665fa1ccb7ccdc26daa727b5a0ccba882301f795528dfee2236c88275939f0139633a9e2d3774070c4361b7e1d4f2a61dfff148bcbc
struct MeshesIndicesLOD {
  offset: u32,
  count: u32,
}
struct MeshesIndices {
  lod0: MeshesIndicesLOD,
  lod1: MeshesIndicesLOD,
  lod2: MeshesIndicesLOD,
  lod3: MeshesIndicesLOD,
}

fn transform_matrix(pos: vec3f, rotation: Quat, scale: f32) -> mat4x4f {
  // https://github.com/greggman/wgpu-matrix/blob/31963458dcafa4cf430d981afd9b31bc5eba55e3/src/mat4-impl.ts#L193
  let x = rotation.x;
  let y = rotation.y;
  let z = rotation.z;
  let w = rotation.w;

  let x2 = x + x;
  let y2 = y + y;
  let z2 = z + z;

  let xx = x * x2;
  let yx = y * x2;
  let yy = y * y2;
  let zx = z * x2;
  let zy = z * y2;
  let zz = z * z2;
  let wx = w * x2;
  let wy = w * y2;
  let wz = w * z2;

  // https://github.com/greggman/wgpu-matrix/blob/31963458dcafa4cf430d981afd9b31bc5eba55e3/src/mat4-impl.ts#L1600
  return mat4x4f(
    vec4f(1 - yy - zz,     yx + wz,     zx - wy, 0) * scale, // right 
    vec4f(    yx - wz, 1 - xx - zz,     zy + wx, 0) * scale, // up
    vec4f(    zx + wy,     zy - wx, 1 - xx - yy, 0) * scale, // forward 
    vec4f(      pos.x,       pos.y,       pos.z, 1),
  );
}

fn quat_unpack32(p: u32) -> Quat {
  // pack layout: 10-10-10-2
  // Constants used in packing (must match TypeScript)
  const Q_BITS: u32 = 10u;
  const Q_MAX: f32 = 1023.0; // (2^10 - 1)
  const NORMALIZATION_FACTOR: f32 = 0.70710678118; // 1.0 / sqrt(2.0)

  // 1. Extract the index of the dropped component from the highest 2 bits
  let maxIndex: u32 = p >> 30u;

  // 2. Extract the three smallest components
  let q1_u: u32 = (p >> 0u) & 0x3FFu;  // Bits 0-9
  let q2_u: u32 = (p >> 10u) & 0x3FFu; // Bits 10-19
  let q3_u: u32 = (p >> 20u) & 0x3FFu; // Bits 20-29

  // 3. Convert back to normalized float values (map [0, Q_MAX] to [-norm, norm])
  let c1: f32 = (f32(q1_u) / Q_MAX * 2.0 - 1.0) * NORMALIZATION_FACTOR;
  let c2: f32 = (f32(q2_u) / Q_MAX * 2.0 - 1.0) * NORMALIZATION_FACTOR;
  let c3: f32 = (f32(q3_u) / Q_MAX * 2.0 - 1.0) * NORMALIZATION_FACTOR;

  // 4. Reconstruct the largest component using the unit length property
  let remaining_sq_sum = c1*c1 + c2*c2 + c3*c3;
  // Use max(0.0, ...) for numerical stability
  let c_large: f32 = sqrt(max(0.0, 1.0 - remaining_sq_sum));

  // 5. Place components into the correct vector order based on the index
  // Use select to conditionally assign values based on the maxIndex
  // WGSL doesn't have an easy switch for non-contiguous locations, so we use select/if or array access simulation
  if (maxIndex == 0u) {
      return vec4f(c_large, c1, c2, c3);
  } else if (maxIndex == 1u) {
      return vec4f(c1, c_large, c2, c3);
  } else if (maxIndex == 2u) {
      return vec4f(c1, c2, c_large, c3);
  }
  return vec4f(c1, c2, c3, c_large);
}

fn quat_unpack(packed: u32) -> vec4f {
  let max_idx = packed >> 30u;
  let a = f32((packed >> 20u) & 1023u) / 1023.0 * 1.414214 - 0.707107;
  let b = f32((packed >> 10u) & 1023u) / 1023.0 * 1.414214 - 0.707107;
  let c = f32(packed & 1023u) / 1023.0 * 1.414214 - 0.707107;
  let d = sqrt(1.0 - (a*a + b*b + c*c));

  if (max_idx == 0u) { return vec4f(d, a, b, c); }
  if (max_idx == 1u) { return vec4f(a, d, b, c); }
  if (max_idx == 2u) { return vec4f(a, b, d, c); }
  return vec4<f32>(a, b, c, d);
}

`;
