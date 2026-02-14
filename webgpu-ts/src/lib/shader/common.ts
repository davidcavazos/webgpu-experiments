export const shaderCommon = /* wgsl */ `

enable f16;

// https://reingd.substack.com/p/animation-compression

alias Quat = vec4f;

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d00000100f700000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c47d3f389f3ccfa9c33006aae80cea0d2fd8376339cf467d9da971fc8d7c75653a9163db1b3dbc81e0eeefb00845d0a9860bc2a2fca28dacbf3d89808339f6fac09c552d6fd50deef0f26b0f9bfffef836c68a9b43c0a95dc80d0568da7c7d080a6bd07c830bc495a5847b8380f07dd3ced349f27d6487aa51e2f2f284aa45fff26236000
struct Globals {
  screen_width: u32,
  screen_height: u32,
  entities_size: u32,
  views_size: u32,
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

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d00000100c700000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c35c7a3a1cbc68ea323870d4d1d6661765deb8c399f71a6665991d6cd6a28ff9716d76c67e0484d9dbcf26790927c5fbcebb1ac3c892c2df40435feaebe9d2675aecffd417fce7345adcb08c2664761e1940246aab7a1b55cd6a4ec75b3affa4734e3510a600af30712835f397772017ffe25c700
struct EntityView {
  camera_id: u32,
  light_id: u32,
};

// // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d00000100d000000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c35c7a3a1cbc4075a9de2f64eed23c38f74bcd087f2fd447185f21e3b9f3e6cf38930abc114ae8e1352e1cf62d16adf6b59aa46b8e65bf8d8be12e1fe0c64302987163da012947df65c503899810408370d765930d973bf24c6f90743ab68a3c40b962cca6f889b9e9f22894aed5ba6afb7f1a2d0ffff6ccc0000
// struct EntityBounds {
//   min: vec3f,
//   scale: f32,
//   max: vec3f,
// }

struct Camera {
  projection: mat4x4f,
}

// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d00000100f101000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6cd143999bf4dd0f91fde00ad47aeeaeea2897560809be7a93fa762a6dbddf51c00db0890c9560a18d24942aefbbc515575afc1f6a3ffe2fdcd86c6f38ceff95431cd4cd26a8f450ef02e025ea179242c90a65ee78c4fd83ded7bc9d8251aa64092e68a4873d665778660e15b07849b76f92aecdaed6a43fe6f8ed664ab6c8ee076ca5a59689a4a5ff4c2303db85e14a4ef8a0a5f67346059ff9eef381da506ff3c9b99e67b1af669878f3e3cee92b9f72a4d9b83b76bc82d10e13e10200ecf7c78a424305940b32c93cefc617369457d7472054f600615458b617504909a6a5449d54cf28c5b553a1597ede015150d1c4148ac85887ac342ba34ec1c19cc89f3efa709bdfd88c66e1fbc30b02e587196130cfeab10a44593cf57d5683a44025c5916087bfffee8ee2f2
// size_px = bounds_radius * size_culling_k / distance
struct View {
  entity_id: u32,
  _pack_lod_flags: u32, // lod: u16, flags: u16
  direction: vec3<f16>,
  shadow_bias: f16,
  world_position: vec3f,
  size_culling_k: f32, // 0.5 * viewport_height / tan(0.5 * fov)
  frustum: array<vec4f, 6>, // left, right, bottom, top, near, far
  view_projection: mat4x4f,
  inverse_view_projection: mat4x4f,
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

fn vec3_transform_quat(v: vec3f, q: Quat) -> vec3f {
  // https://github.com/greggman/wgpu-matrix/blob/31963458dcafa4cf430d981afd9b31bc5eba55e3/src/vec3-impl.ts#L746
  let w2 = q.w * 2;
  let uvx = q.y * v.z - q.z * v.y;
  let uvy = q.z * v.x - q.x * v.z;
  let uvz = q.x * v.y - q.y * v.x;
  return vec3f(
    v.x + uvx * w2 + (q.y * uvz - q.z * uvy) * 2,
    v.y + uvy * w2 + (q.z * uvx - q.x * uvz) * 2,
    v.z + uvz * w2 + (q.x * uvy - q.y * uvx) * 2,
  );
}

fn quat_inverse(q: Quat) -> Quat {
  // https://github.com/greggman/wgpu-matrix/blob/31963458dcafa4cf430d981afd9b31bc5eba55e3/src/quat-impl.ts#L339
  let dot = q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w;
  let inv_dot = select(0, 1.0 / dot, dot != 0);
  return Quat(
    -q.x * inv_dot,
    -q.y * inv_dot,
    -q.z * inv_dot,
     q.w * inv_dot,
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

fn mat4_from_transform(pos: vec3f, rotation: Quat, scale: f32) -> mat4x4f {
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
    vec4f(      pos.x,       pos.y,       pos.z, 1),         // position
  );
}

fn mat4_from_quat(q: Quat) -> mat4x4f {
  // https://github.com/greggman/wgpu-matrix/blob/31963458dcafa4cf430d981afd9b31bc5eba55e3/src/mat4-impl.ts#L193
  let x2 = q.x + q.x;
  let y2 = q.y + q.y;
  let z2 = q.z + q.z;
  let w2 = q.w + q.w;

  let xx = q.x * x2;
  let yx = q.y * x2;
  let yy = q.y * y2;
  let zx = q.z * x2;
  let zy = q.z * y2;
  let zz = q.z * z2;
  let wx = q.w * x2;
  let wy = q.w * y2;
  let wz = q.w * z2;

  return mat4x4f(
    vec4f(1 - yy - zz,     yx + wz,     zx - wy, 0), // right
    vec4f(    yx - wz, 1 - xx - zz,     zy + wx, 0), // up
    vec4f(    zx + wy,     zy - wx, 1 - xx - yy, 0), // forward
    vec4f(          0,           0,           0, 1), // position
  );
}

fn mat4_translate(m: mat4x4f, v: vec3f) -> mat4x4f {
  // https://github.com/greggman/wgpu-matrix/blob/31963458dcafa4cf430d981afd9b31bc5eba55e3/src/mat4-impl.ts#L1131
  return mat4x4f(
    m[0],
    m[1],
    m[2],
    vec4f(
      m[0][0] * v.x + m[1][0] * v.y + m[2][0] * v.z + m[3][0],
      m[0][1] * v.x + m[1][1] * v.y + m[2][1] * v.z + m[3][1],
      m[0][2] * v.x + m[1][2] * v.y + m[2][2] * v.z + m[3][2],
      m[0][3] * v.x + m[1][3] * v.y + m[2][3] * v.z + m[3][3],
    ),
  );
}

fn mat4_transpose(m: mat4x4f) -> mat4x4f {
  // https://github.com/greggman/wgpu-matrix/blob/31963458dcafa4cf430d981afd9b31bc5eba55e3/src/mat4-impl.ts#L379
  return mat4x4f(
    vec4f(m[0][0], m[1][0], m[2][0], m[3][0]),
    vec4f(m[0][1], m[1][1], m[2][1], m[3][1]),
    vec4f(m[0][2], m[1][2], m[2][2], m[3][2]),
    vec4f(m[0][3], m[1][3], m[2][3], m[3][3]),
  );
}

`;
