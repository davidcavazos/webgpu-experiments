import { mat4 } from "wgpu-matrix";
import { Flatten } from "./passes/flatten";
import type { Stage } from "./stage";
import type { State } from "./start";
import { RenderColor, type DrawCmd } from "./renderColor";

export class Renderer {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  depthTexture: GPUTexture;
  stage: Stage;
  pass: {
    flatten: Flatten;
    opaque: RenderColor;
  };

  constructor(device: GPUDevice, args: {
    canvas: HTMLCanvasElement;
    stage: Stage;
  }) {
    this.device = device;
    this.canvas = args.canvas;
    const context = args.canvas.getContext("webgpu");
    if (!context) {
      throw Error("Could not get a WebGPU context.");
    }
    this.context = context;
    this.context.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: "premultiplied",
    });

    this.depthTexture = this.createDepthTexture();
    this.stage = args.stage;
    this.pass = {
      flatten: new Flatten(this.device, {
        globals: this.stage.globals,
        entities_local: this.stage.entities.local.buffer,
        entities_world_A: this.stage.entities.world_A,
        entities_world_B: this.stage.entities.world_B,
      }),
      opaque: new RenderColor(this.device, {
        label: 'opaque',
        textureFormat: this.context.getCurrentTexture().format,
        vertex_buffer: this.stage.entities.meshes.geometry.buffer,
        index_buffer: this.stage.entities.meshes.geometry.buffer,
        globals: this.stage.globals,
        views: this.stage.views.buffer,
        instances: this.stage.draws.instances,
        entities_world_A: this.stage.entities.world_A,
        entities_world_B: this.stage.entities.world_B,
      }),
    };
  };

  createDepthTexture(): GPUTexture {
    return this.device.createTexture({
      label: "depth_texture",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      size: [this.canvas.width, this.canvas.height],
      format: "depth32float",
      sampleCount: 1,
    });
  }

  draw<a>(state: State<a>) {
    this.stage.writeGlobals();
    const encoder = this.device.createCommandEncoder();
    this.pass.flatten.dispatch(encoder, this.stage.entities.size(), state.current);

    // TODO: this should all be done in compute passes.
    const draws = this.TODO();

    this.pass.opaque.draw(encoder, {
      renderTexture: this.context.getCurrentTexture().createView(),
      depthTexture: this.depthTexture,
      current: state.current,
      draws,
    });
    this.device.queue.submit([encoder.finish()]);
  }

  TODO(): DrawCmd[] {
    for (const [camera, viewport] of this.stage.viewports) {
      // TODO: multiply projection by view matrix.
      // - The transform is on the GPU only, so must be done in shader pass.
      const position = [-7104.193, 2070.043, 2618.442];
      const rotation = [0.4829551183136082, 0.005567826827333644, 0.010094142023693057, 0.8755692213013953];
      const view = mat4.identity();
      mat4.translate(view, position, view);
      mat4.mul(view, mat4.fromQuat(rotation), view);
      mat4.invert(view, view);
      this.stage.views.set(camera.entity, {
        view_projection: mat4.mul(camera.projection, view),
        pinned: true,
      });
    }
    const instances = new Uint32Array(this.stage.entities.entries.values().map(ref => ref.id));
    this.device.queue.writeBuffer(this.stage.draws.instances, 0, instances);
    const draws: DrawCmd[] = [];
    for (const ref of this.stage.entities) {
      if (ref.mesh === undefined) {
        continue;
      }
      const mesh = this.stage.entities.meshes.entries.get(ref.mesh);
      if (mesh?.geometry === undefined) {
        continue;
      }
      draws.push({
        indexCount: mesh.geometry.lod0.indexCount,
        instanceCount: 1,
        firstIndex: mesh.geometry.lod0.firstIndex,
        baseVertex: mesh.geometry.baseVertex,
        firstInstance: draws.length,
      });
      break;
    }
    return draws;
  }

  resize(size: { width: number, height: number; }) {
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    this.stage.resizeViewports(size.width, size.height);
    this.depthTexture.destroy();
    this.depthTexture = this.createDepthTexture();
  }
}
