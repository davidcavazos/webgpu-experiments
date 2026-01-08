import {
  EmptyAsset,
  isLoading,
  LoadingAsset,
  MeshAsset,
  type Asset,
  type AssetID,
  type AssetLOD,
  type RequestID,
} from "./asset";
import { EntityBuffer } from "./assets/entityBuffer";
import { Globals } from "./assets/globals";
import { IndexBuffer, type IndexBufferSlot } from "./assets/indexBuffer";
import { LightBuffer } from "./assets/lightBuffer";
import { Locals } from "./assets/locals";
import { VertexBuffer, type VertexBufferSlot } from "./assets/vertexBuffer";
import type { Resource, ResourceLoader } from "./resource";
import type { Entity } from "./entity";
import { loadObj } from "./loaders/mesh.obj";
import type { Scene } from "./scene";
import { parseInt, hashString, hashRecord, splitBatches } from "./stdlib";

// As a proof of concept, this only supports loading, not unloading.
// This means the entire scene must fit into GPU memory.
// To support data streaming, this must support unloading.
// TODO: Support unloading
// - This requires memory management like malloc (avoid fragmentation)
// TODO: add max memory usage (limit VRAM, useful for testing and sharing GPU)
// * Should be refreshed at 1-10 Hz for data streaming
// * Should probably be an async call to avoid freezing a frame
//   - On the first frame, call async
//   - Subsequent frames, check if done
//   - When done, upload changes to GPU
//   - If data is uploaded, wait until next cycle (each second?)
// * There must be a way to "force" upload data, regardless of the cycle
//   - Example: spawn a cube every time you click
//   - await request(...)
// * On each refresh:
//   - Track how many times a resource is requested
//   - Track when was the last time a resource was requested
//   - Eviction of unused resources (free up memory)
//     - Last time used > 5-10 s
//     - Distance within threshold
// * On resource request:
//   - If mesh doesn't fit in memory, force eviction
//   - If larger than a threshold, use lower LOD
//   - Evict Least Recently Used until enough memory
//     - Only if a lower LOD is loaded
//   - If nothing can be evicted, force LRU replacement in order
//     - Load one step lower LOD
//     - Unload current LOD

export type FilePattern = string;

export interface InstanceGroup {
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  instancesCount: number;
  vertices: VertexBufferSlot;
  indices: IndexBufferSlot;
}

export class Engine {
  static readonly BIND_GROUP_SCENE = 0;
  static readonly BIND_GROUP_MODEL = 1;

  readonly device: GPUDevice;
  readonly canvas: HTMLCanvasElement;
  readonly context: GPUCanvasContext;
  readonly loaders: Record<FilePattern, ResourceLoader>;
  staged: Record<AssetID, Asset>;
  loading: Record<RequestID, Promise<Resource>>;
  passes: {
    opaque: Record<AssetID, InstanceGroup>;
  };
  shaderModule: GPUShaderModule;
  globals: Globals;
  vertexBuffer: VertexBuffer;
  indexBuffer: IndexBuffer;
  entityBuffer: EntityBuffer;
  lightBuffer: LightBuffer;
  depthTexture: GPUTexture;
  pipeline: GPURenderPipeline;
  globalsBindGroup: GPUBindGroup;
  constructor(args: {
    device: GPUDevice;
    canvas: HTMLCanvasElement;
    context: GPUCanvasContext;
    loaders?: Record<AssetID, ResourceLoader>;
    shaders?: string;
  }) {
    this.device = args.device;
    this.canvas = args.canvas;
    this.context = args.context;
    this.loaders = {
      ...args.loaders,
      "*.obj": loadObj,
    };

    this.staged = {};
    this.loading = {};
    this.passes = {
      opaque: {},
    };
    this.shaderModule = this.device.createShaderModule({
      code: args.shaders ?? defaultShaders,
    });

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.globals = new Globals(this.device);
    this.vertexBuffer = new VertexBuffer(this.device);
    this.indexBuffer = new IndexBuffer(this.device);
    this.entityBuffer = new EntityBuffer(this.device);
    this.lightBuffer = new LightBuffer(this.device);
    this.depthTexture = this.createDepthTexture();

    const bindGroupLayoutGlobals = this.device.createBindGroupLayout({
      label: "Globals",
      entries: [
        {
          binding: 0, // globals
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
        {
          binding: 1, // instances
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 2, // lights
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
      ],
    });

    const bindGroupLayoutLocals = this.device.createBindGroupLayout({
      label: "Locals",
      entries: [
        {
          binding: 0, // model
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.pipeline = this.device.createRenderPipeline({
      label: "Opaque",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          bindGroupLayoutGlobals, // @group(0)
          bindGroupLayoutLocals, // @group(1)
        ],
      }),
      vertex: {
        module: this.shaderModule,
        entryPoint: "opaque_vertex",
        buffers: [VertexBuffer.layout],
      },
      fragment: {
        module: this.shaderModule,
        entryPoint: "opaque_pixel",
        targets: [{ format: presentationFormat }],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus",
      },
    });

    this.globalsBindGroup = this.device.createBindGroup({
      label: "Globals",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.globals.buffer },
        { binding: 1, resource: this.entityBuffer.buffer },
        { binding: 2, resource: this.lightBuffer.buffer },
      ],
    });
  }

  createDepthTexture(): GPUTexture {
    return this.device.createTexture({
      label: "Depth texture",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      size: [this.canvas.width, this.canvas.height],
      format: "depth24plus",
      sampleCount: 1,
    });
  }

  stage(scene: Scene, now: number) {
    this.globals.writeBuffer();
    // TODO: keep track on LRU of when an asset was used with `now`
    const instances = Object.values(scene.entities).map((entity) => ({
      entity,
      lod: 0,
    }));
    let opaques: Record<AssetID, { entities: Entity[]; asset: MeshAsset }> = {};
    for (const { entity, lod } of instances) {
      const { id, asset } = this.request(entity.resource, lod);
      switch (asset.tag) {
        case "MeshAsset":
          if (!(id in opaques)) {
            opaques[id] = { entities: [], asset };
          }
          opaques[id]!.entities.push(entity);
          break;
      }
    }

    const modelUniformSize = Uint32Array.BYTES_PER_ELEMENT;
    this.entityBuffer.clear();
    for (const [id, { entities, asset }] of Object.entries(opaques)) {
      if (!(id in this.passes.opaque)) {
        const buffer = this.device.createBuffer({
          label: `[opaque] ${id}`,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          size: modelUniformSize,
        });
        this.passes.opaque[id] = {
          buffer,
          bindGroup: this.device.createBindGroup({
            label: `[opaque] ${id}`,
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: buffer }],
          }),
          instancesCount: entities.length,
          vertices: asset.vertices,
          indices: asset.indices,
        };
      }
      const slot = this.entityBuffer.write(entities);
      const data = new ArrayBuffer(modelUniformSize);
      new Uint32Array(data, 0).set([slot.offset / EntityBuffer.stride]);
      this.device.queue.writeBuffer(this.passes.opaque[id]!.buffer, 0, data);
    }
  }

  draw(scene: Scene, now: number) {
    this.stage(scene, now);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(Engine.BIND_GROUP_SCENE, this.globalsBindGroup);
    for (const model of Object.values(this.passes.opaque)) {
      pass.setBindGroup(Engine.BIND_GROUP_MODEL, model.bindGroup);
      pass.setVertexBuffer(0, model.vertices.buffer, model.vertices.offset);
      pass.setIndexBuffer(
        model.indices.buffer,
        model.indices.format,
        model.indices.offset,
      );
      pass.drawIndexed(model.indices.count, model.instancesCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  request(content: Resource, lod: AssetLOD = 0): { id: AssetID; asset: Asset } {
    const id = getAssetID(content, lod);
    if (!(id in this.staged)) {
      // Not loaded, try to load it.
      this.staged[id] = this.loadAsset(id, content, lod);
    }
    const staged = this.staged[id]!;
    if (isLoading(staged)) {
      // Still loading, try to find a lower LOD.
      const lowerAssetId = Object.keys(this.staged)
        .filter((id2) => isLowerLOD(id, id2))
        .sort()[0];
      if (lowerAssetId !== undefined) {
        return { id, asset: this.staged[lowerAssetId]! };
      }
    }
    // Nothing else to try, return whatever `loadAsset` gave us.
    // This could either be Loading or a AssetError.
    return { id, asset: staged };
  }

  loadAsset(id: AssetID, content: Resource, lod: AssetLOD): Asset {
    switch (content.tag) {
      case "Empty":
        return EmptyAsset();

      case "Reference":
        const request = this.loading[id];
        if (request === undefined) {
          // Create a new request.
          const loader = this.findFileLoader(content.filename);
          if (loader === undefined) {
            throw new Error(
              `[LibraryMesh3D.load] Could not find a loader for: ${id}`,
            );
          }
          this.loading[id] = loader(content.filename, lod)
            .then((content) => {
              delete this.loading[id];
              delete this.staged[id];
              return this.request(content);
            })
            .catch((e) => {
              return e;
            })
            .finally(() => {});
        }
        return LoadingAsset(id);

      case "Mesh":
        return MeshAsset({
          vertices: this.vertexBuffer.write(content.vertices),
          indices: this.indexBuffer.write(content.indices),
        });

      case "Camera":
        return EmptyAsset();

      default:
        throw new Error(
          `Engine.loadAsset: not implemented: ${(content as Resource).tag}`,
        );
    }
  }

  free(id: AssetID, lod: AssetLOD) {
    throw new Error("TODO: LibraryMesh3D.free");
  }

  findFileLoader(id: AssetID): ResourceLoader | undefined {
    // 1) Try exact match.
    const loader = this.loaders[id];
    if (loader !== undefined) {
      return loader;
    }
    for (const [pattern, loader] of Object.entries(this.loaders)) {
      // 2) Try glob pattern.
      const glob = pattern
        .split(/(\*\*|\*|\.)/)
        .map((tok) => ({ "**": ".*", "*": "[^/]*", ".": "\\." })[tok] ?? tok)
        .join("");
      if (id.match(glob)) {
        this.loaders[id] = loader; // cache it
        return loader;
      }

      // 3) Try regular expression.
      try {
        if (id.match(pattern)) {
          this.loaders[id] = loader; // cache it
          return loader;
        }
      } catch (_) {
        // Not a valid regular expression, just skip.
      }
    }
    return undefined;
  }

  async shaderCompilationMessages(): Promise<{
    info: string[];
    warnings: string[];
    errors: string[];
  }> {
    const compilationInfo = await this.shaderModule.getCompilationInfo();
    let info: string[] = [];
    let warnings: string[] = [];
    let errors: string[] = [];
    if (compilationInfo.messages.length > 0) {
      console.log("Shader Compilation Messages:");
      for (const msg of compilationInfo.messages) {
        const message = `${msg.lineNum}:${msg.linePos}: ${msg.message}`;
        switch (msg.type) {
          case "info":
            info.push(message);
            break;
          case "warning":
            warnings.push(message);
            break;
          case "error":
            errors.push(message);
            break;
        }
      }
    }
    return { info, warnings, errors };
  }
}

export function getAssetID(content: Resource, lod: AssetLOD): AssetID {
  return `${getAssetIDBase(content)}:${lod}`;
}

function splitAssetID(id: AssetID): { base: string; lod: AssetLOD } {
  const [base, lod] = id.split(":", 2);
  return { base: base ?? "", lod: parseInt(lod ?? "0") };
}

function isLowerLOD(id1: AssetID, id2: AssetID): boolean {
  const x = splitAssetID(id1);
  const y = splitAssetID(id2);
  return x.base === y.base && x.lod < y.lod;
}

function getAssetIDBase(content: Resource) {
  switch (content.tag) {
    case "Empty":
      return "<Empty>";
    case "Reference":
      return content.filename;
    case "Mesh":
      if (content.id !== undefined) {
        return content.id;
      }
      return `Mesh<${hashRecord(content)}>`;
    case "Camera":
      return `Camera<${hashRecord(content)}>`;
    // case "AssetError":
    //   return `AssetError<${content.id}:${content.lod}>`;
    // case "CameraDescriptor": {
    //   const hash = JSON.stringify([...asset.projection]);
    //   return `Camera<${hash}>`;
    // }
    default:
      throw new Error(
        `engine.getAssetIDBase: not implemented ${(content as Resource).tag}`,
      );
  }
}

// TODO: make this a function to get max counts for Camera and Entity
const defaultShaders = /* wgsl */ `
  struct Globals {
    view_projection: mat4x4f,
  };
  @group(0) @binding(0) var<uniform> globals: Globals;

  struct Instance {
    transform: mat4x4f,
  };
  @group(0) @binding(1) var<storage, read> instances: array<Instance>;
  
  struct Light {
    color: u32,
    direction: vec3f,
  };
  @group(0) @binding(2) var<storage, read> lights: array<Light>;

  struct Model {
    instance_offset: u32,
  };
  @group(1) @binding(0) var<uniform> model: Model;

  struct VertexInput {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
  };

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
  };

  @vertex fn opaque_vertex(
    // @builtin(vertex_index) vertex_index : u32,
    @builtin(instance_index) instance_id: u32,
    input: VertexInput
  ) -> VertexOutput {
    var instance = instances[model.instance_offset + instance_id];
    var output: VertexOutput;
    output.position = globals.view_projection * instance.transform * vec4f(input.position, 1.0);
    output.normal = input.normal;
    return output;
  }

  @fragment fn opaque_pixel(input: VertexOutput) -> @location(0) vec4f {
    // return globals.color;
    // return vec4f(1, 1, 1, 1);
    return vec4f(input.normal * 0.5 + 0.5, 1);
  }
`;
