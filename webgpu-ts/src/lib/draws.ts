const DEBUG = {
  WRITE_BUFFER: {
    ALL: false,
    INSTANCES: false,
    DRAW_CMDS: false,
  },
};

export interface DrawCmd {
  indexCount: number;
  instanceCount: number;
  firstIndex: number;
  baseVertex: number;
  firstInstance: number;
}

export class Draws {
  static readonly INSTANCES = { size: 4 }; // u32
  static readonly DRAW_CMD = {
    size: 20,
    view: (data: ArrayBuffer) => ({
      indexCount: new Uint32Array(data, 0, 1),
      instanceCount: new Uint32Array(data, 4, 1),
      firstIndex: new Uint32Array(data, 8, 1),
      firstInstance: new Uint32Array(data, 12, 1),
      baseVertex: new Int32Array(data, 16, 1),
    }),
  };

  device: GPUDevice;
  instances: GPUBuffer;
  draw_cmds: GPUBuffer;

  constructor(device: GPUDevice, args?: {
    instances?: {
      capacity?: number;
    };
    draw_cmds?: {
      capacity?: number;
    };
  }) {
    this.device = device;
    this.instances = this.device.createBuffer({
      label: 'instances',
      size: (args?.instances?.capacity ?? 1000000) * Draws.INSTANCES.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.draw_cmds = this.device.createBuffer({
      label: 'draw_cmds',
      size: (args?.draw_cmds?.capacity ?? 4096) * Draws.DRAW_CMD.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }
}