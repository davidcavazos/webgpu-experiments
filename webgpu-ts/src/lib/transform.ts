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

export class Transform {
  position: Vec3Arg;
  orientation: QuatArg;
  scale: Vec3Arg;
  constructor(args?: {
    position?: Vec3Arg;
    rotation?: QuatArg;
    scale?: Vec3Arg;
  }) {
    this.position = args?.position ?? vec3.create();
    this.orientation = args?.rotation ?? quat.identity();
    this.scale = args?.scale ?? vec3.create(1, 1, 1);
    console.log(
      "TODO: make Transform be a matrix, that we can apply translation, rotation, scale in any order",
    );
  }

  matrix(dst?: Mat4): Mat4 {
    return this.matrixTranslateRotateScale(dst);
  }

  matrixTranslateRotateScale(dst?: Mat4): Mat4 {
    quat.normalize(this.orientation, this.orientation); // prevent drift
    dst = mat4.identity(dst);
    mat4.scale(dst, this.scale, dst);
    mat4.multiply(dst, mat4.fromQuat(this.orientation), dst);
    mat4.translate(dst, this.position, dst);
    return dst;
  }

  matrixRotateTranslateScale(dst?: Mat4): Mat4 {
    quat.normalize(this.orientation, this.orientation); // prevent drift
    dst = mat4.identity(dst);
    mat4.scale(dst, this.scale, dst);
    mat4.translate(dst, this.position, dst);
    mat4.multiply(dst, mat4.fromQuat(this.orientation), dst);
    return dst;
  }

  translate(offset: Vec3Arg): Transform {
    const worldOffset = vec3.transformQuat(offset, this.orientation);
    return this.translateWorld(worldOffset);
  }
  translateWorld(offset: Vec3Arg): Transform {
    vec3.add(this.position, offset, this.position);
    return this;
  }

  pitch(angleInRadians: number): Transform {
    return this.rotateX(angleInRadians);
  }
  rotateX(angleInRadians: number): Transform {
    quat.rotateX(this.orientation, angleInRadians, this.orientation);
    return this;
  }
  getPitch(): number {
    const { x, y, z, w } = quatValues(this.orientation);
    return Math.asin(clamp(2.0 * (w * x - y * z), 1, -1));
  }

  yaw(angleInRadians: number): Transform {
    return this.rotateY(angleInRadians);
  }
  rotateY(angleInRadians: number): Transform {
    quat.rotateY(this.orientation, angleInRadians, this.orientation);
    return this;
  }
  getYaw(): number {
    const { x, y, z, w } = quatValues(this.orientation);
    return Math.atan2(2.0 * (w * y + z * x), 1.0 - 2.0 * (x * x + y * y));
  }

  roll(angleInRadians: number): Transform {
    return this.rotateZ(angleInRadians);
  }
  rotateZ(angleInRadians: number): Transform {
    quat.rotateZ(this.orientation, angleInRadians, this.orientation);
    return this;
  }
  getRoll(): number {
    const { x, y, z, w } = quatValues(this.orientation);
    return Math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (z * z + x * x));
  }

  lookAt(target: Vec3Arg, up?: Vec3Arg): Transform {
    const m = mat4.lookAt(this.position, target, up ?? [0, 1, 0]);
    quat.fromMat(m, this.orientation);
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
