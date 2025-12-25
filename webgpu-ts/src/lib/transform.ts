import { mat4 } from "./mat4";

export class Transform {
  matrix: Float32Array;
  constructor(matrix?: Float32Array) {
    this.matrix = matrix ?? mat4.identity();
  }

  translate(x: number, y: number, z: number): Transform {
    return new Transform(mat4.translate(this.matrix, [x, y, z]));
  }

  rotate(yaw: number, pitch: number, roll: number): Transform {
    // const r11 = this.matrix[0] ?? 1; //  (1, 1)
    // const r21 = this.matrix[4] ?? 0; //  (2, 1)
    // const r31 = this.matrix[8] ?? 0; //  (3, 1)
    // const r32 = this.matrix[9] ?? 0; //  (3, 2)
    // const r33 = this.matrix[10] ?? 1; // (3, 3)
    // const current = {
    //   yaw: Math.atan2(r21, r11),
    //   pitch: Math.asin(-r31),
    //   roll: Math.atan2(r32, r33),
    // };
    return this.yaw(yaw).pitch(pitch).roll(roll);
  }

  scale(x: number, y: number, z: number): Transform {
    return new Transform(mat4.scale(this.matrix, [x, y, z]));
  }

  yaw(x: number): Transform {
    return new Transform(mat4.rotateY(this.matrix, x));
  }

  pitch(y: number): Transform {
    return new Transform(mat4.rotateX(this.matrix, y));
  }

  roll(z: number): Transform {
    return new Transform(mat4.rotateZ(this.matrix, z));
  }
}
