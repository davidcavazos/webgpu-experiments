import { VertexBuffer } from "./assets/vertexBuffer";
import {
  Engine,
  type Asset,
  type AssetID,
  type AssetLoader,
  type AssetLOD,
  type FilePattern,
  type Mesh,
} from "./engine";
import { mat4 } from "./mat4";
import type { Scene } from "./scene";

export class Renderer {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  // camera: Camera
  viewProjection = new Float32Array(4 * 4);
  scene: Scene;
  engine: Engine;
  // TODO: move these into Engine
  globalsBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  pipeline: GPURenderPipeline;

  constructor(args: {
    device: GPUDevice;
    canvas: HTMLCanvasElement; // TODO: provide camera instead
    context: GPUCanvasContext;
    scene?: Scene;
    loaders?: Record<FilePattern, AssetLoader>;
  }) {
    this.device = args.device;
    this.context = args.context;
    this.setProjection(args.canvas.clientWidth, args.canvas.clientHeight);
    this.engine = new Engine(this.device, args.loaders);
    this.scene = args?.scene ?? {};
    this.stageScene(performance.now());

    // const depthTexture = device.createTexture({
    //   size: [context.canvas.width, context.canvas.height],
    //   format: "depth24plus",
    //   usage: GPUTextureUsage.RENDER_ATTACHMENT,
    // });

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.globalsBuffer = this.device.createBuffer({
      size: 4 * 4 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
      ],
    });
    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: this.device.createShaderModule({ code: shaderSource }),
        entryPoint: "opaque_vertex",
        buffers: [VertexBuffer.layout],
      },
      fragment: {
        module: this.device.createShaderModule({ code: shaderSource }),
        entryPoint: "opaque_pixel",
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      // depthStencil: {
      //   depthWriteEnabled: true,
      //   depthCompare: "less",
      //   format: "depth24plus",
      // },
    });
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.globalsBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.engine.entityBuffer.buffer },
        },
      ],
    });

    throw new Error("TODO: vertex shader instancing");
  }

  setProjection(width: number, height: number) {
    const fieldOfView = 100;
    const aspect = width / height;
    const zNear = 1;
    const zFar = 2000;
    mat4.perspective(fieldOfView, aspect, zNear, zFar, this.viewProjection);
  }

  isLoading(): boolean {
    return this.engine.isLoading();
  }

  stageScene(now: number) {
    // TODO: pass the Scene and Camera directly
    const entities = Object.values(this.scene).map((entity) => ({
      entity,
      lod: 0,
    }));
    return this.engine.stage(entities, now);
  }

  draw(now: number) {
    this.stageScene(now);

    // TODO: move this into stageScene
    this.device.queue.writeBuffer(this.globalsBuffer, 0, this.viewProjection);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
      // depthStencilAttachment: {
      //   view: depthTexture.createView(),
      //   depthClearValue: 1.0,
      //   depthLoadOp: "clear",
      //   depthStoreOp: "store",
      // },
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    for (const batch of Object.values(this.engine.passes.opaque)) {
      pass.setVertexBuffer(0, batch.vertices.buffer);
      pass.setIndexBuffer(batch.indices.buffer, batch.indices.format);
      pass.drawIndexed(batch.indices.count);
    }

    // drawOpaque(now: number, pass: GPURenderPassEncoder) {
    //   // TODO(optimization): use indirect draw
    //   console.log("--- drawOpaque ---");
    //   for (const [assetId, instances] of Object.entries(this.instances)) {
    //     console.log(assetId);
    //     // pass.drawIndexed()
    //   }
    //   // mesh.getViewMatrix().set(viewMatrix);
    //   // mesh.translate([200, 200, 0]);
    //   // mesh.rotate([40, 25, 325]);
    //   // mesh.scale([100, 100, 100]);
    //   // pass.setPipeline(this.pipeline);
    //   // pass.setBindGroup(0, this.bindGroup); // uniforms
    //   // pass.setVertexBuffer(0, this.vertexBuffer);
    //   // pass.setIndexBuffer(this.indexBuffer, "uint16");
    //   // pass.drawIndexed(this.indexCount);
    // }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  // levelOfDetail(
  //   entityTransform: Float32Array,
  //   cameraTransform: Float32Array,
  // ): AssetLOD {
  //   // TODO: calculate level of detail
  //   // - use distance
  //   // - configurable settings
  //   // - 3 to 5 LODs
  //   return 0;
  // }
}

const shaderSource = /* wgsl */ `
  struct Globals {
    viewProjection: mat4x4f,
  };
  @group(0) @binding(0) var<uniform> globals: Globals;

  struct Entity {
    transform: mat4x4f,
  };
  @group(0) @binding(1) var<storage, read> entities: array<Entity, 100>;

  struct VertexInput {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
  };

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
  };

  @vertex fn opaque_vertex(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = globals.viewProjection * entities[0].transform * vec4f(input.position, 1.0);
    output.normal = input.normal;
    return output;
  }

  @fragment fn opaque_pixel(input: VertexOutput) -> @location(0) vec4f {
    // return globals.color;
    // return vec4f(1, 1, 1, 1);
    return vec4f(input.normal * 0.5 + 0.5, 1);
  }
`;
