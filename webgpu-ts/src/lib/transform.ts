import {
  mat4,
  quat,
  vec3,
  type Mat4,
  type Mat4Arg,
  type Quat,
  type QuatArg,
  type Vec3,
  type Vec3Arg,
} from "wgpu-matrix";
import { clamp } from "./stdlib";

// TODO: Store Position-Rotation-Scale (PRS) instead of Mat4
// TODO: Make uniform scale (single f32 instead of vec3)
export class Transform {
  matrix: Mat4;
  constructor(args?: {
    position?: Vec3Arg;
    rotation?: QuatArg;
    scale?: number;
  }) {
    this.matrix = mat4.identity();
    if (args?.position) {
      mat4.translate(this.matrix, args.position, this.matrix);
    }
    if (args?.rotation) {
      mat4.multiply(this.matrix, mat4.fromQuat(args.rotation), this.matrix);
    }
    if (args?.scale) {
      mat4.uniformScale(this.matrix, args.scale, this.matrix);
    }
  }

  identity(): Transform {
    mat4.identity(this.matrix);
    return this;
  }

  right(dst?: Vec3): Vec3 {
    dst ??= vec3.create();
    dst.set([this.matrix[0]!, this.matrix[1]!, this.matrix[2]!]);
    return dst;
  }
  setRight(vec: Vec3Arg): Transform {
    this.matrix[0]! = vec[0]!;
    this.matrix[1]! = vec[1]!;
    this.matrix[2]! = vec[2]!;
    return this;
  }

  up(dst?: Vec3): Vec3 {
    dst ??= vec3.create();
    dst.set([this.matrix[4]!, this.matrix[5]!, this.matrix[6]!]);
    return dst;
  }
  setUp(vec: Vec3Arg): Transform {
    this.matrix[4]! = vec[0]!;
    this.matrix[5]! = vec[1]!;
    this.matrix[6]! = vec[2]!;
    return this;
  }

  forward(dst?: Vec3): Vec3 {
    dst ??= vec3.create();
    dst.set([this.matrix[8]!, this.matrix[9]!, this.matrix[10]!]);
    return dst;
  }
  setForward(vec: Vec3Arg): Transform {
    this.matrix[8]! = vec[0]!;
    this.matrix[9]! = vec[1]!;
    this.matrix[10]! = vec[2]!;
    return this;
  }

  getPosition(dst?: Vec3): Vec3 {
    dst ??= vec3.create();
    dst.set([this.matrix[12]!, this.matrix[13]!, this.matrix[14]!]);
    return dst;
  }
  setPosition(vec: Vec3Arg): Transform {
    this.matrix[12]! = vec[0]!;
    this.matrix[13]! = vec[1]!;
    this.matrix[14]! = vec[2]!;
    return this;
  }
  getRotation(dst?: Quat): Quat {
    dst ??= quat.create();
    return quat.fromMat(this.matrix, dst);
  }
  getScale(dst?: Vec3): Vec3 {
    dst ??= vec3.create();
    dst.set([
      vec3.len(this.right()),
      vec3.len(this.up()),
      vec3.len(this.forward()),
    ]);
    return dst;
  }
  getScaleUniform(): number {
    const scale = this.getScale();
    const sum = scale.reduce((x, y) => x + y, 0);
    return sum / scale.length;
  }

  distance(vec: Vec3Arg): number {
    return vec3.distance(this.getPosition(), vec);
  }

  apply(transform: Transform): Transform {
    mat4.multiply(transform.matrix, this.matrix, this.matrix);
    return this;
  }

  multiply(mat: Mat4Arg): Transform {
    mat4.multiply(this.matrix, mat, this.matrix);
    return this;
  }

  translate(offset: Vec3Arg): Transform {
    mat4.translate(this.matrix, offset, this.matrix);
    return this;
  }
  // translateWorld(offset: Vec3Arg): Transform {
  //   vec3.add(this.position, offset, this.position);
  //   return this;
  // }

  pitch(angleInRadians: number, limit?: number): Transform {
    limit ??= 0.99999;
    mat4.rotateX(this.matrix, angleInRadians, this.matrix);
    this.matrix[9] = clamp(this.matrix[9]!, limit, -limit);
    return this;
  }
  rotateX(angleInRadians: number): Transform {
    mat4.rotateX(this.matrix, angleInRadians, this.matrix);
    return this;
  }
  getPitch(): number {
    // const { x, y, z, w } = quatValues(this.orientation);
    // return Math.asin(clamp(2.0 * (w * x - y * z), 1, -1));
    return Math.asin(-this.matrix[9]!);
  }

  yaw(angleInRadians: number): Transform {
    mat4.rotateY(this.matrix, angleInRadians, this.matrix);
    return this;
  }
  rotateY(angleInRadians: number): Transform {
    mat4.rotateY(this.matrix, angleInRadians, this.matrix);
    return this;
  }
  getYaw(): number {
    // const { x, y, z, w } = quatValues(this.orientation);
    // return Math.atan2(2.0 * (w * y + z * x), 1.0 - 2.0 * (x * x + y * y));
    return Math.atan2(this.matrix[8]!, this.matrix[10]!);
  }

  roll(angleInRadians: number): Transform {
    mat4.rotateZ(this.matrix, angleInRadians, this.matrix);
    return this;
  }
  rotateZ(angleInRadians: number): Transform {
    mat4.rotateZ(this.matrix, angleInRadians, this.matrix);
    return this;
  }
  getRoll(): number {
    // const { x, y, z, w } = quatValues(this.orientation);
    // return Math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (z * z + x * x));
    return Math.atan2(this.matrix[1]!, this.matrix[5]!);
  }

  rotate(axis: Vec3Arg, angleInRadians: number): Transform {
    mat4.rotate(this.matrix, axis, angleInRadians, this.matrix);
    return this;
  }

  alignUp(up?: Vec3Arg): Transform {
    up ??= [0, 1, 0];
    const forward = this.forward();
    const right = vec3.normalize(vec3.cross(up, forward));
    this.setRight(right);
    return this.setUp(vec3.normalize(vec3.cross(forward, right)));
  }

  aim(target: Vec3Arg, up?: Vec3Arg): Transform {
    // mat4.aim(this.position(), target, up ?? [0, 1, 0], this.matrix);
    this.setForward(vec3.normalize(vec3.sub(target, this.getPosition())));
    return this.alignUp(up ?? [0, 1, 0]);
  }

  cameraAim(target: Vec3Arg, up?: Vec3Arg): Transform {
    this.setForward(vec3.normalize(vec3.sub(this.getPosition(), target)));
    return this.alignUp(up ?? [0, 1, 0]);
  }

  lookAt(target: Vec3Arg, up?: Vec3Arg): Transform {
    // const m = mat4.lookAt(this.position, target, up ?? [0, 1, 0]);
    // quat.fromMat(m, this.orientation);
    mat4.lookAt(this.getPosition(), target, up ?? [0, 1, 0], this.matrix);
    return this;
  }

  static orbiting(
    pivot: Vec3Arg,
    yawInRadians: number,
    pitchInRadians: number,
  ): Transform {
    return new Transform()
      .translate(vec3.negate(pivot))
      .yaw(yawInRadians)
      .pitch(pitchInRadians)
      .translate(pivot);
  }

  orbit(
    pivot: Vec3Arg,
    yawInRadians: number,
    pitchInRadians: number,
  ): Transform {
    const orbiting = Transform.orbiting(pivot, yawInRadians, pitchInRadians);
    return this.apply(orbiting);
  }
}

export function vec3Values(v: Vec3Arg): { x: number; y: number; z: number; } {
  return { x: v[0]!, y: v[1]!, z: v[2]! };
}

export function quatValues(q: QuatArg): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  return { x: q[0]!, y: q[1]!, z: q[2]!, w: q[3]! };
}

export function vec3YawPitch(v: Vec3Arg): { yaw: number; pitch: number; } {
  const direction = vec3.normalize(v);
  return {
    yaw: Math.atan2(direction[0]!, direction[2]!),
    pitch: Math.asin(direction[1]!),
  };
}
