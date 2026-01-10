import {
  mat4,
  vec3,
  type Mat4,
  type Mat4Arg,
  type Quat,
  type QuatArg,
  type Vec2,
  type Vec3,
  type Vec3Arg,
  type Vec4,
} from "wgpu-matrix";
import { VertexBuffer } from "./assets/vertexBuffer";
import { loadObj } from "./loaders/mesh.obj";
import { Transform } from "./transform";
import { defaultShaders } from "./shaders";
import { hashRecord, toFixedLength } from "./stdlib";
import { GPUArena, type GPUArenaSlot } from "./gpu-arena";
import { GPUStore } from "./gpu-store";

export const MAX_U16_VALUE = 0xffff;
export const MAX_U32_VALUE = 0xffffffff;

export type FilePattern = string;
// export type ResourceLoader = () => void;

export type MeshId = string;
export type MeshLodId = string;
export type MeshIndex = number;
export interface Mesh {
  fromFile?: {
    filename: string;
    name: string;
  };
  bounds?: MeshBounds;
  vertices?: number[][];
  lod0?: number[]; // 100%+ close ups
  lod1?: number[]; // 50% 15-50 meters
  lod2?: number[]; // 10%-25% 50-150 meters, silhouette
  lod3?: number[]; // ~0% 150+ meters, impostors
}
export interface MeshData {
  bounds: MeshBounds; // 28b
  vertexOffset: number; // 4b u32
  indices: {
    lod0: MeshIndices; // 8b
    lod1: MeshIndices; // 8b
    lod2: MeshIndices; // 8b
    lod3: MeshIndices; // 8b
  };
}
export interface MeshBounds {
  center: Vec3; // 12b
  extents: Vec3; // 12b
  radius: number; // 4b f32
}
export interface MeshIndices {
  offset: number; // 4b u32
  count: number; // 4b u32
}
function getMeshBounds(vertices: number[][]): MeshBounds {
  const [head, ...tail] = vertices;
  if (head === undefined) {
    return {
      center: vec3.create(),
      extents: vec3.create(),
      radius: 0,
    };
  }
  const min = vec3.create(head[0], head[1], head[2]);
  const max = vec3.copy(min);
  const vertex = vec3.create();
  for (const xs of tail) {
    vertex.set([xs[0]!, xs[1]!, xs[2]!]);
    vec3.min(vertex, min, min);
    vec3.max(vertex, max, max);
  }
  const center = vec3.mulScalar(vec3.add(max, min), 0.5);
  const extents = vec3.mulScalar(vec3.sub(max, min), 0.5);
  let radiusSq = 0;
  for (const xs of vertices) {
    vertex.set([xs[0]!, xs[1]!, xs[2]!]);
    const distSq = vec3.distSq(vertex, center);
    radiusSq = Math.max(radiusSq, distSq);
  }
  return { center, extents, radius: Math.sqrt(radiusSq) };
}

export type MaterialId = string;
export type MaterialIndex = number;
export interface Material {}
export interface MaterialData {}

export type EntityId = string;
export type EntityIndex = number;
export interface Entity {
  transform?: Transform;
  meshId?: MeshId;
  materialId?: MaterialId;
  light?: undefined; // TODO
  children?: [EntityId, Entity][];
}
export interface EntityData {
  transform: Transform;
  parentIndex: EntityIndex;
  meshIndex: MeshIndex;
  materialIndex: MaterialIndex;
}

// TODO: Animation 128b
// Base Track        | 16b | Clip A/B IDs, Times, and Crossfade Weight."
// Action Layer      | 16b | "Layer Clip, Time, MaskID, and Alpha (The ""Carry"" layer)."
// Motion Trajectory | 24b | "3x vec2<f32>: Current, 0.5s, and 1.0s Future Direction/Velocity."
// IK / Grounding    | 16b | 4x f16 Height Targets for feet + 2x f16 Hips/Spine Offset.
// Look-At/Head      | 12b | vec3<f32> World Space Coordinate for head/eye tracking.
// Secondary Phys    | 16b | "Spring Stiffness, Damping, and External Force (Wind/Gravity)."
// Attachment IDs    | 16b | 4x u32 Entity IDs of objects glued to this character.
// LOD & Metadata    | 12b | "SkeletonID, Playback Speed, and Bitflags (Loop, Reverse, Ragdoll)."

// TODO: Skeleton, resource
// name: string
// parent: u32
// inverse_pose_matrix: mat4

// TODO: Bones, per-entity (mat4)

export class Renderer {
  static readonly Binding = {
    CAMERA: 0,
    ENTITIES: 1,
  };

  static readonly CAMERA_VIEW_PROJECTION_OFFSET = 0;
  static readonly CAMERA_VIEW_PROJECTION_SIZE = 4 * 4;
  static readonly CAMERA_SIZE =
    this.CAMERA_VIEW_PROJECTION_SIZE * Float32Array.BYTES_PER_ELEMENT;

  static readonly ENTITY_TRANSFORM_OFFSET = 0;
  static readonly ENTITY_TRANSFORM_SIZE = 4 * 4;
  static readonly ENTITY_STRIdE = 128;

  device: GPUDevice;
  context: GPUCanvasContext;
  // TODO: group scene/resources and arenas
  scene: Map<EntityId, { index: EntityIndex; entity: EntityData }>;
  resources: {
    meshes: Map<MeshId, Mesh>;
    materials: Map<MaterialId, Material>;
  };
  camera: {
    projection: Mat4;
    transform: Transform;
    viewProjection: Mat4;
    buffer: GPUBuffer;
  };
  vertices: GPUArena<MeshId, number[][]>;
  indices: GPUArena<MeshLodId, number[]>;
  entities: GPUStore<EntityId, EntityData>;
  meshes: GPUStore<MeshId, MeshData>;
  materials: GPUStore<MaterialId, MaterialData>;
  // lights
  // bounds
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  shaderModule: GPUShaderModule;
  depthTexture: GPUTexture;
  pipeline: GPURenderPipeline;
  constructor(args: {
    device: GPUDevice;
    context: GPUCanvasContext;
    width: number;
    height: number;
    scene?: [EntityId, Entity][];
    resources?: {
      meshes?: [MeshId, Mesh][];
      materials?: [MaterialId, Material][];
    };
    shaders?: string;
  }) {
    this.device = args.device;
    this.context = args.context;
    this.resources = {
      meshes: new Map(args.resources?.meshes),
      materials: new Map(args.resources?.materials),
    };
    this.scene = new Map();
    for (const [id, entity] of args.scene ?? []) {
      this.add([id], entity);
    }

    this.camera = {
      projection: mat4.identity(),
      transform: new Transform(),
      viewProjection: mat4.identity(),
      buffer: this.device.createBuffer({
        label: "Camera",
        size: Renderer.CAMERA_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    };

    this.vertices = new GPUArena({
      device: this.device,
      label: "Vertices",
      maxSize: this.device.limits.maxBufferSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      serialize: (vertices) => {
        const values = vertices.flatMap((xs) => toFixedLength(xs, 8, 0));
        return new Float32Array(values);
      },
    });

    this.indices = new GPUArena({
      device: this.device,
      label: "Indices",
      maxSize: this.device.limits.maxBufferSize,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      serialize: (indices) => {
        return new Uint32Array(indices);
      },
    });

    this.entities = new GPUStore({
      device: this.device,
      label: "Entities",
      maxSize: this.device.limits.maxStorageBufferBindingSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      stride: 32,
      serialize: (entity, dst) => {
        let offset = 0;
        offset += writeVec3(dst, offset, entity.transform.getPosition()); //   +12 = 12
        offset += writeQuatU32(dst, offset, entity.transform.getRotation()); // +4 = 16
        offset += writeF32(dst, offset, entity.transform.getScaleUniform()); // +4 = 20
        offset += writeU32(dst, offset, entity.parentIndex); //                 +4 = 24
        offset += writeU16(dst, offset, entity.meshIndex); //                   +2 = 26
        offset += writeU16(dst, offset, entity.materialIndex); //               +2 = 28
        // total 28 bytes, 4 bytes free
      },
    });

    this.meshes = new GPUStore({
      device: this.device,
      label: "Meshes",
      maxSize: this.device.limits.maxStorageBufferBindingSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      stride: 64,
      serialize: (mesh, dst) => {
        let offset = 0;
        offset += writeVec3(dst, offset, mesh.bounds.center); //     +12 = 12
        offset += writeVec3(dst, offset, mesh.bounds.extents); //    +12 = 24
        offset += writeF32(dst, offset, mesh.bounds.radius); //       +4 = 28
        offset += writeU32(dst, offset, mesh.vertexOffset); //        +4 = 32
        offset += writeU32(dst, offset, mesh.indices.lod0.offset); // +4 = 36
        offset += writeU32(dst, offset, mesh.indices.lod0.count); //  +4 = 40
        offset += writeU32(dst, offset, mesh.indices.lod1.offset); // +4 = 44
        offset += writeU32(dst, offset, mesh.indices.lod1.count); //  +4 = 48
        offset += writeU32(dst, offset, mesh.indices.lod2.offset); // +4 = 52
        offset += writeU32(dst, offset, mesh.indices.lod2.count); //  +4 = 56
        offset += writeU32(dst, offset, mesh.indices.lod3.offset); // +4 = 60
        offset += writeU32(dst, offset, mesh.indices.lod3.count); //  +4 = 64
        // total 64 bytes, 0 bytes free
      },
    });

    this.materials = new GPUStore({
      device: this.device,
      label: "Materials",
      maxSize: this.device.limits.maxStorageBufferBindingSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      stride: 32,
      serialize: (material) => {},
    });

    // lights
    // bounds

    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: "Scene layout",
      entries: [
        {
          binding: Renderer.Binding.CAMERA,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
        {
          binding: Renderer.Binding.ENTITIES,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      label: "Scene",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: Renderer.Binding.CAMERA,
          resource: this.camera.buffer,
        },
        {
          binding: Renderer.Binding.ENTITIES,
          resource: this.entities.buffer,
        },
      ],
    });

    this.shaderModule = this.device.createShaderModule({
      code: args.shaders ?? defaultShaders,
    });
    this.depthTexture = this.createDepthTexture(args.width, args.height);

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.pipeline = this.device.createRenderPipeline({
      label: "Opaque",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
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
  }

  createDepthTexture(width: number, height: number): GPUTexture {
    return this.device.createTexture({
      label: "Depth texture",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      size: [width, height],
      format: "depth24plus",
      sampleCount: 1,
    });
  }

  updateCameraViewProjection() {
    mat4.mul(
      this.camera.projection,
      mat4.inverse(this.camera.transform.matrix),
      this.camera.viewProjection,
    );
    this.device.queue.writeBuffer(
      this.camera.buffer,
      Renderer.CAMERA_VIEW_PROJECTION_OFFSET,
      this.camera.viewProjection as Float32Array<ArrayBuffer>,
      Renderer.CAMERA_VIEW_PROJECTION_SIZE,
    );
  }

  add(path: EntityId[], entity: Entity, parentIndex?: number) {
    const id = path.join("/");
    const entityData = {
      transform: entity.transform ?? new Transform(),
      meshIndex: this.streamMesh(entity.meshId),
      materialIndex: this.materials.NULL,
      parentIndex: parentIndex ?? this.entities.NULL,
    };
    const index = this.entities.add(id, entityData);
    this.scene.set(id, { index, entity: entityData });
    for (const [childId, child] of entity.children ?? []) {
      this.add([...path, childId], child, index);
    }
  }

  streamVertices(id: MeshId, vertices: number[][]): GPUArenaSlot {
    let slot = this.vertices.get(id);
    if (slot === undefined) {
      if (vertices.length === 0) {
        return { offset: this.vertices.NULL, size: 0 };
      }
      slot = this.vertices.add(id, vertices);
    }
    return slot;
  }

  streamIndices(
    id: MeshLodId,
    indices: number[],
    fallback?: MeshIndices,
  ): MeshIndices {
    let slot = this.indices.get(id);
    if (slot === undefined) {
      if (indices.length === 0) {
        if (fallback) {
          return fallback;
        }
        return { offset: this.indices.NULL, count: 0 };
      }
      slot = this.indices.add(id, indices);
    }
    return { offset: slot.offset, count: indices.length };
  }

  streamMesh(id: MeshId | undefined): MeshIndex {
    if (id === undefined) {
      return this.meshes.NULL;
    }
    let index = this.meshes.get(id);
    if (index === undefined) {
      const mesh = this.resources.meshes.get(id);
      if (mesh === undefined) {
        console.error(`Undefined mesh resource: ${id}`);
        return this.meshes.NULL;
      }
      if (mesh.fromFile) {
        console.error("TODO: Renderer.streamMesh fromFile");
      }
      const vertices = mesh.vertices ?? [];
      const lod0 = this.streamIndices(`${id}:0`, mesh.lod0 ?? []);
      const lod1 = this.streamIndices(`${id}:1`, mesh.lod1 ?? [], lod0);
      const lod2 = this.streamIndices(`${id}:2`, mesh.lod2 ?? [], lod1);
      const lod3 = this.streamIndices(`${id}:3`, mesh.lod3 ?? [], lod2);
      const meshData: MeshData = {
        bounds: mesh.bounds ?? getMeshBounds(vertices),
        vertexOffset: this.streamVertices(id, vertices).offset,
        indices: { lod0, lod1, lod2, lod3 },
      };
      index = this.meshes.add(id, meshData);
    }
    return index;
  }

  draw() {
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

    // 1) Build bounds
    //    - Local to world
    //    - Morton code
    //    - Find LOD
    //    - Request missing assets
    // 2) Radix sort bounds by morton code
    // 3) * Build BVH (not yet)
    // 4) Find visible
    //    - * Frustom culling (not yet)
    //    - * Small culling (not yet)
    //    - * Occlusion culling (not yet)
    //    - Count instances, atomic add on mesh lod draw command
    //    - Set a bit in a bit buffer to mark it as visible (workgroup aggregated)
    // 5) Prefix sum
    //    - Calculate firstInstance offsets for each mesh lod draw command
    // 6) Instances
    //    - Use the bit buffer to see visibility
    //    - Atomic add the next available slot
    //    - Write entity into instance batch
    // 7) Draw indexed

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertices.buffer);
    pass.setIndexBuffer(this.indices.buffer, "uint32");
    // for (const e of this.entities.entries()) {
    // }
    // for (const model of Object.values(this.passes.opaque)) {
    //   pass.drawIndexed(model.indices.count, model.instancesCount);
    // }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  // ---------------

  // request(
  //   resource: Resource,
  //   lod: AssetLOD = 0,
  // ): { id: AssetId; asset: Asset } {
  //   const id = getAssetId(resource, lod);
  //   let asset = this.assets.get(id);
  //   if (!asset) {
  //     // Not loaded, try to load it.
  //     asset = this.loadAsset(id, resource, lod);
  //     this.assets.set(id, asset);
  //   }
  //   if (asset.tag === "LoadingAsset") {
  //     // Still loading, try to find a lower LOD.
  //     const lowerAssetId = [...this.assets.keys()]
  //       .filter((id2) => isLowerLOD(id, id2))
  //       .sort()[0];
  //     if (lowerAssetId !== undefined) {
  //       return { id, asset: this.assets.get(lowerAssetId)! };
  //     }
  //   }
  //   // Nothing else to try, return whatever `loadAsset` gave us.
  //   // This could either be Loading or a AssetError.
  //   return { id, asset };
  // }

  // loadAsset(id: AssetId, resource: Resource, lod: AssetLOD): Asset {
  //   switch (resource.tag) {
  //     case "Empty":
  //       return EmptyAsset();

  //     case "Reference":
  //       let request = this.loading.get(id);
  //       if (request === undefined) {
  //         // Create a new request.
  //         const loader = this.findFileLoader(resource.filename);
  //         if (loader === undefined) {
  //           throw new Error(
  //             `[LibraryMesh3D.load] Could not find a loader for: ${id}`,
  //           );
  //         }
  //         request = loader(resource.filename, lod)
  //           .then((resource) => {
  //             this.loading.delete(id);
  //             this.assets.delete(id);
  //             return this.request(resource);
  //           })
  //           .catch((e) => {
  //             return e;
  //           })
  //           .finally(() => {});
  //       }
  //       return LoadingAsset(id);

  //     case "Mesh":
  //       throw new Error("TODO: write to vertex and index buffers");
  //     // return MeshAsset({
  //     //   vertices: this.vertices.write(resource.vertices),
  //     //   indices: this.indices.write(resource.indices),
  //     // });

  //     case "Camera":
  //       return EmptyAsset();

  //     default:
  //       throw new Error(
  //         `Engine.loadAsset: not implemented: ${(resource as Resource).tag}`,
  //       );
  //   }
  // }

  // findFileLoader(id: AssetId): ResourceLoader | undefined {
  //   // 1) Try exact match.
  //   const loader = this.loaders[id];
  //   if (loader !== undefined) {
  //     return loader;
  //   }
  //   for (const [pattern, loader] of Object.entries(this.loaders)) {
  //     // 2) Try glob pattern.
  //     const glob = pattern
  //       .split(/(\*\*|\*|\.)/)
  //       .map((tok) => ({ "**": ".*", "*": "[^/]*", ".": "\\." })[tok] ?? tok)
  //       .join("");
  //     if (id.match(glob)) {
  //       this.loaders[id] = loader; // cache it
  //       return loader;
  //     }

  //     // 3) Try regular expression.
  //     try {
  //       if (id.match(pattern)) {
  //         this.loaders[id] = loader; // cache it
  //         return loader;
  //       }
  //     } catch (_) {
  //       // Not a valid regular expression, just skip.
  //     }
  //   }
  //   return undefined;
  // }

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

function packQuat(quat: Quat): number {
  const absQuat = quat.map(Math.abs);

  // 1. Find the index of the largest component
  let maxIndex = 0;
  for (let i = 1; i < quat.length; i++) {
    if (absQuat[i]! > absQuat[maxIndex]!) {
      maxIndex = i;
    }
  }

  // 2. Ensure the largest component is positive (q and -q are the same rotation)
  const sign = quat[maxIndex]! < 0 ? -1 : 1;

  // 3. Collect the other three components
  const smalls: number[] = [];
  for (let i = 0; i < quat.length; i++) {
    if (i === maxIndex) continue;
    // Map [-0.707, 0.707] to [0, 1023]
    const normalized = (quat[i]! * sign + 0.707107) / 1.414214;
    smalls.push(Math.max(0, Math.min(1023, Math.floor(normalized * 1023))));
  }

  // 4. Pack into 32 bits: [2 bits Index] [10 bits A] [10 bits B] [10 bits C]
  return (
    (maxIndex << 30) | (smalls[0]! << 20) | (smalls[1]! << 10) | smalls[2]!
  );
}

function writeF32(dst: ArrayBufferLike, offset: number, value: number): number {
  const slice = new Float32Array(dst, offset, 1);
  slice.set([value]);
  return slice.byteLength;
}

function writeU16(dst: ArrayBufferLike, offset: number, value: number): number {
  const slice = new Uint16Array(dst, offset, 1);
  slice.set([value]);
  return slice.byteLength;
}

function writeU32(dst: ArrayBufferLike, offset: number, value: number): number {
  const slice = new Uint32Array(dst, offset, 1);
  slice.set([value]);
  return slice.byteLength;
}

function writeVec3(dst: ArrayBufferLike, offset: number, vec: Vec3): number {
  const slice = new Float32Array(dst, offset, 3);
  slice.set([...vec]);
  return slice.byteLength;
}

function writeQuatU32(
  dst: ArrayBufferLike,
  offset: number,
  quat: Quat,
): number {
  return writeU32(dst, offset, packQuat(quat));
}
