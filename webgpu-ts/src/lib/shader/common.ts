export const shaderCommon = /* wgsl */ `

enable f16;

// https://reingd.substack.com/p/animation-compression

alias Quat = vec4f;

struct Globals {
  entities_size: u32,
};

alias EntityId = u32;
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

struct EntityWorld {
  position: vec3f,
  scale: f32,
  rotation: vec4<f16>,
  morton_code: u32,
  flags: u32,
};

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
