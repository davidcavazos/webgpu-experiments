import {
  mat4,
  quat,
  vec3,
  type Mat4,
  type Quat,
  type QuatArg,
  type Vec3,
  type Vec3Arg,
} from "wgpu-matrix";
import { clamp } from "./stdlib";

const DEFAULT_PITCH_CLAMP_LIMIT = Math.PI / 2 - 0.001; // ~89.9 degrees in radians

export class Transform {
  matrix: Mat4;
  constructor(args?: {
    position?: Vec3Arg;
    orientation?: QuatArg;
    scale?: Vec3Arg;
  }) {
    this.matrix = mat4.identity();
    if (args?.scale) {
      mat4.scale(this.matrix, args.scale, this.matrix);
    }
    if (args?.orientation) {
      mat4.multiply(this.matrix, mat4.fromQuat(args.orientation), this.matrix);
    }
    if (args?.position) {
      mat4.translate(this.matrix, args.position, this.matrix);
    }
  }

  position(dst?: Vec3): Vec3 {
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

  translate(offset: Vec3Arg): Transform {
    mat4.translate(this.matrix, offset, this.matrix);
    return this;
  }
  // translateWorld(offset: Vec3Arg): Transform {
  //   vec3.add(this.position, offset, this.position);
  //   return this;
  // }

  pitch(angleInRadians: number, limitInRadians?: number): Transform {
    limitInRadians ??= DEFAULT_PITCH_CLAMP_LIMIT;
    const angle = clamp(angleInRadians, limitInRadians, -limitInRadians);
    mat4.rotateX(this.matrix, angleInRadians, this.matrix);
    return this;
  }
  // rotateX(angleInRadians: number): Transform {
  //   quat.rotateX(this.orientation, angleInRadians, this.orientation);
  //   return this;
  // }
  getPitch(): number {
    // const { x, y, z, w } = quatValues(this.orientation);
    // return Math.asin(clamp(2.0 * (w * x - y * z), 1, -1));
    return Math.asin(-this.matrix[9]!);
  }

  yaw(angleInRadians: number): Transform {
    mat4.rotateY(this.matrix, angleInRadians, this.matrix);
    return this;
  }
  // rotateY(angleInRadians: number): Transform {
  //   quat.rotateY(this.orientation, angleInRadians, this.orientation);
  //   return this;
  // }
  getYaw(): number {
    // const { x, y, z, w } = quatValues(this.orientation);
    // return Math.atan2(2.0 * (w * y + z * x), 1.0 - 2.0 * (x * x + y * y));
    return Math.atan2(this.matrix[8]!, this.matrix[10]!);
  }

  roll(angleInRadians: number): Transform {
    mat4.rotateZ(this.matrix, angleInRadians, this.matrix);
    return this;
  }
  // rotateZ(angleInRadians: number): Transform {
  //   quat.rotateZ(this.orientation, angleInRadians, this.orientation);
  //   return this;
  // }
  getRoll(): number {
    // const { x, y, z, w } = quatValues(this.orientation);
    // return Math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (z * z + x * x));
    return Math.atan2(this.matrix[1]!, this.matrix[5]!);
  }

  lookAt(target: Vec3Arg, up?: Vec3Arg): Transform {
    // const m = mat4.lookAt(this.position, target, up ?? [0, 1, 0]);
    // quat.fromMat(m, this.orientation);
    mat4.lookAt(this.position(), target, up ?? [0, 1, 0], this.matrix);
    return this;
  }
}

export function vec3Values(v: Vec3Arg): { x: number; y: number; z: number } {
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
