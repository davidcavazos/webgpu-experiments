import type {
  Asset,
  AssetDescriptor,
  AssetID,
  AssetLoader,
  AssetLOD,
  Mesh,
  RequestID,
} from "./asset";
import { EntityBuffer, type EntityBufferSlot } from "./assets/entityBuffer";
import { Globals } from "./assets/globals";
import { IndexBuffer, type IndexBufferSlot } from "./assets/indexBuffer";
import { VertexBuffer, type VertexBufferSlot } from "./assets/vertexBuffer";
import { loadObj } from "./loaders/mesh.obj";
import type { Entity, Scene } from "./scene";
import { parseInt, stringHash } from "./stdlib";

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

export interface BatchDraw {
  entities: EntityBufferSlot;
  vertices: VertexBufferSlot;
  indices: IndexBufferSlot;
}

export class Engine {
  readonly device: GPUDevice;
  readonly canvas: HTMLCanvasElement;
  readonly context: GPUCanvasContext;
  readonly loaders: Record<FilePattern, AssetLoader>;
  staged: Record<AssetID, Asset>;
  loading: Record<RequestID, Promise<AssetDescriptor>>;
  passes: {
    opaque: Record<AssetID, BatchDraw>;
  };
  shaderModule: GPUShaderModule;
  globals: Globals;
  entityBuffer: EntityBuffer;
  vertexBuffer: VertexBuffer;
  indexBuffer: IndexBuffer;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  constructor(args: {
    device: GPUDevice;
    canvas: HTMLCanvasElement;
    context: GPUCanvasContext;
    loaders?: Record<AssetID, AssetLoader>;
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
    this.entityBuffer = new EntityBuffer(this.device);
    this.vertexBuffer = new VertexBuffer(this.device);
    this.indexBuffer = new IndexBuffer(this.device);

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0, // globals
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
        // {
        //   binding: 1, // cameras
        //   visibility: GPUShaderStage.VERTEX,
        //   buffer: { type: "uniform" },
        // },
        {
          binding: 2, // entities
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
          binding: 0, // globals
          resource: { buffer: this.globals.buffer },
        },
        // {
        //   binding: 1, // cameras
        //   resource: { buffer: this.lightBuffer.buffer },
        // },
        {
          binding: 2, // entities
          resource: { buffer: this.entityBuffer.buffer },
        },
      ],
    });
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

  draw(scene: Scene, now: number) {
    this.globals.writeBuffer();
    this.stage(scene, now);

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
    for (const batch of Object.values(this.passes.opaque)) {
      pass.setVertexBuffer(0, batch.vertices.buffer);
      pass.setIndexBuffer(batch.indices.buffer, batch.indices.format);
      pass.drawIndexed(batch.indices.count, batch.entities.count);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  stage(scene: Scene, now: number) {
    // TODO: keep track on LRU of when an asset was used with `now`
    const instances = Object.values(scene.entities).map((entity) => ({
      entity,
      lod: 0,
    }));
    let opaques: Record<AssetID, { entities: Entity[]; asset: Mesh }> = {};
    for (const { entity, lod } of instances) {
      const { id, asset } = this.request(entity.asset, lod);
      switch (asset.tag) {
        case "Mesh":
          if (id in opaques) {
            opaques[id]?.entities.push(entity);
          } else {
            opaques[id] = { entities: [entity], asset };
          }
          break;
      }
    }
    this.passes = {
      opaque: Object.fromEntries(
        Object.entries(opaques).map(([id, { entities, asset }]) => {
          const batch: BatchDraw = {
            entities: this.entityBuffer.write(entities),
            vertices: asset.vertices,
            indices: asset.indices,
          };
          return [id, batch];
        }),
      ),
    };
  }

  request(
    asset: AssetDescriptor,
    lod: AssetLOD = 0,
  ): { id: AssetID; asset: Asset } {
    const id = getAssetID(asset, lod);
    if (!(id in this.staged)) {
      // Not loaded, try to load it.
      this.staged[id] = this.loadAsset(id, asset, lod);
    }
    const staged = this.staged[id]!;
    if (staged.tag === "AssetLoading") {
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

  loadAsset(id: AssetID, asset: AssetDescriptor, lod: AssetLOD): Asset {
    switch (asset.tag) {
      case "Node":
        return asset;
      case "AssetReference":
        const request = this.loading[id];
        if (request === undefined) {
          // Create a new request.
          const loader = this.findFileLoader(asset.filename);
          if (loader === undefined) {
            throw new Error(
              `[LibraryMesh3D.load] Could not find a loader for: ${id}`,
            );
          }
          this.loading[id] = loader(asset.filename, lod)
            .then((asset) => {
              delete this.loading[id];
              return this.request(asset);
            })
            .catch((e) => {
              return e;
            })
            .finally(() => {});
        }
        return { tag: "AssetLoading", id };

      case "MeshDescriptor":
        return {
          tag: "Mesh",
          vertices: this.vertexBuffer.write(asset.vertices),
          indices: this.indexBuffer.write(asset.indices),
        };

      case "AssetError":
        return asset;

      default:
        throw new Error(
          `Engine.loadAsset: not implemented: ${(asset as Asset).tag}`,
        );
    }
  }

  free(id: AssetID, lod: AssetLOD) {
    throw new Error("TODO: LibraryMesh3D.free");
  }

  findFileLoader(id: AssetID): AssetLoader | undefined {
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
}

export function getAssetID(asset: AssetDescriptor, lod: AssetLOD): AssetID {
  return `${getAssetIDBase(asset)}:${lod}`;
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

function getAssetIDBase(asset: AssetDescriptor) {
  switch (asset.tag) {
    case "Node":
      return "Node";
    case "AssetReference":
      return asset.filename;
    case "MeshDescriptor": {
      if (asset.id !== undefined) {
        return asset.id;
      }
      const hash = stringHash(JSON.stringify([asset.vertices, asset.indices]));
      return `Mesh<${hash}>`;
    }
    case "AssetError":
      return `AssetError<${asset.id}:${asset.lod}>`;
    // case "CameraDescriptor": {
    //   const hash = JSON.stringify([...asset.projection]);
    //   return `Camera<${hash}>`;
    // }
    default:
      throw new Error(
        `engine.getAssetIDBase: not implemented ${(asset as AssetDescriptor).tag}`,
      );
  }
}

// TODO: make this a function to get max counts for Camera and Entity
const defaultShaders = /* wgsl */ `
  struct Globals {
    view_projection: mat4x4f,
  };
  @group(0) @binding(0) var<uniform> globals: Globals;

  struct Entity {
    transform: mat4x4f,
  };
  @group(0) @binding(2) var<storage, read> entities: array<Entity, 100>;

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
    // @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instance_id: u32,
    input: VertexInput
  ) -> VertexOutput {
    var entity = entities[instance_id];
    var output: VertexOutput;
    output.position = globals.view_projection * entity.transform * vec4f(input.position, 1.0);
    output.normal = input.normal;
    return output;
  }

  @fragment fn opaque_pixel(input: VertexOutput) -> @location(0) vec4f {
    // return globals.color;
    // return vec4f(1, 1, 1, 1);
    return vec4f(input.normal * 0.5 + 0.5, 1);
  }
`;
