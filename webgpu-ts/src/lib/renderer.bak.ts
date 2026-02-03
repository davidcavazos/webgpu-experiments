import { mat4, vec3, type Mat4, type Quat, type Vec2, type Vec3 } from "wgpu-matrix";
import { Transform } from "./transform";
import { toFixedLength } from "./stdlib";
import { GPUArena, type GPUArenaSlot } from "./gpu/arena";
import { GPUStore } from "./gpu/store";
import { GPUPassCompute as GPUComputePass } from "./gpu/pass-compute";
import { GPUPassRender as GPURenderPass } from "./gpu/pass-render";
import { shaderFlatten } from "./shader/flatten";
import { shaderRender } from "./shader/render";

// On transform (position, rotation, scale) compression
// https://reingd.substack.com/p/animation-compression

const DEBUG = {
  CAMERA_CHANGE: false,
  VERTICES_ADD: true,
  FACES_ADD: true,
  ENTITY_ADD: true,
  MESH_ADD: true,
  MATERIAL_ADD: true,
  DRAW_ADD: true,
};

export const MAX_U16_VALUE = 0xffff;
export const MAX_U32_VALUE = 0xffffffff;

export type FilePattern = string;
// export type ResourceLoader = () => void;

export interface Vertex {
  position: Vec3;
  normal: Vec3;
  uv: Vec2;
}
export interface Face {
  indices: number[];
}

export type MaterialId = string;
export type MaterialIdx = number;
export interface Material {
}
export interface MaterialData { }

export type MeshId = string;
export type MeshLodId = string;
export type MeshIdx = number;
export interface MeshBounds {
  min: Vec3;
  max: Vec3;
}
export interface Mesh {
  vertices: MeshId | Vertex[];
  lods: [
    MeshLodId | Face[],
    MeshLodId | Face[],
    MeshLodId | Face[],
    MeshLodId | Face[],
  ];
  bounds?: MeshBounds;
}

export interface DrawCmd {
  // This order seems easier to reason about in the flow of things.
  // The number like [12] is the offset in bytes expected.
  // https://developer.mozilla.org/en-US/docs/Web/API/GPURenderPassEncoder/drawIndexedIndirect
  baseVertex: GPUSize32; //    [12] const from creation
  indexCount: GPUSize32; //    [ 0] const from creation
  firstIndex: GPUSize32; //    [ 8] const from creation
  instanceCount: GPUSize32; // [ 4] set by 'visible' pass
  firstInstance: GPUSize32; // [16] set by 'prefix sum' pass
}

export type EntityId = string;
export type EntityIndex = number;
export interface Entity {
  transform?: Transform;
  meshId?: MeshId;
  materialId?: MaterialId;
  children?: [EntityId, Entity][];
}
export interface EntityLocal {
  transform: Transform;
  parentIndex: EntityIndex;
  meshIndex: MeshIdx;
  materialIndex: MaterialIdx;
}
export interface EntityWorld {
  transform: Transform;
}
export interface EntityBounds {
  bounds: MeshBounds;
}


export class Renderer {
  static readonly SIZES_ENTITIES = {
    offset: 0,
    size: Uint32Array.BYTES_PER_ELEMENT,
  };
  static readonly SIZES_MESHES = {
    offset: this.SIZES_ENTITIES.offset + this.SIZES_ENTITIES.size,
    size: Uint32Array.BYTES_PER_ELEMENT,
  };
  static readonly SIZES_MATERIALS = {
    offset: this.SIZES_MESHES.offset + this.SIZES_MESHES.size,
    size: Uint32Array.BYTES_PER_ELEMENT,
  };
  static readonly SIZES_SIZE =
    this.SIZES_ENTITIES.size +
    this.SIZES_MESHES.size +
    this.SIZES_MATERIALS.size;

  static readonly CAMERA_VIEW_PROJECTION_OFFSET = 0;
  static readonly CAMERA_VIEW_PROJECTION_SIZE = 4 * 4;
  static readonly CAMERA_SIZE =
    this.CAMERA_VIEW_PROJECTION_SIZE * Float32Array.BYTES_PER_ELEMENT;

  device: GPUDevice;
  context: GPUCanvasContext;
  sizes: GPUBuffer;
  camera: {
    projection: Mat4;
    transform: Transform;
    viewProjection: Mat4;
    buffer: GPUBuffer;
  };
  vertices: GPUArena<MeshId, Vertex[]>;
  faces: GPUArena<MeshLodId, Face[]>;
  entities: {
    local: GPUStore<EntityId, EntityLocal>;
    world: GPUBuffer;
    bounds: GPUBuffer;
  };
  meshes: GPUStore<MeshId, Mesh>; // vertices, indices, bounds
  materials: GPUStore<MaterialId, Material>;
  // lights
  // bounds
  sorted: {
    // mortonCodes: GPUBuffer;
    spatial: GPUBuffer;
  };
  draws: {
    opaque: GPUArena<MeshLodId, DrawCmd>;
    // TODO: maybe each draw pass needs its own instances buffer?
    instances: GPUBuffer;
  };
  depthTexture: GPUTexture;
  passes: {
    flatten: GPUComputePass;
    opaque: GPURenderPass;
  };

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

    this.sizes = this.device.createBuffer({
      label: "Sizes",
      size: Renderer.SIZES_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
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

    this.vertices = new GPUArena(this.device, {
      label: "Vertices",
      size: this.device.limits.maxBufferSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      serialize: (vertices) => {
        const values = vertices.flatMap((v) => [v.position.x, v.position.y, v.position.z, v.normal.x, v.normal.y, v.normal.z, v.uv.x, v.uv.y]);
        return new Float32Array(values);
      },
    });

    this.faces = new GPUArena(this.device, {
      label: "Faces",
      size: this.device.limits.maxBufferSize,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      serialize: (faces) => {
        // TODO: convert all faces to triangles.
        return new Uint32Array(faces.flatMap(face => face.indices));
      },
    });

    this.entities = {
      local: new GPUStore(this.device, {
        label: "Entities local",
        size: this.device.limits.maxStorageBufferBindingSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        stride: 32,
        serialize: (entity, dst) => {
          let offset = 0;
          offset += writeVec3(dst, offset, entity.transform.getPosition()); //   +12 = 12
          offset += writeF32(dst, offset, entity.transform.getScaleUniform()); // +4 = 16
          offset += writeQuatU32(dst, offset, entity.transform.getRotation()); // +4 = 20
          offset += writeU32(dst, offset, entity.parentIndex); //                 +4 = 24
          offset += writeU16(dst, offset, entity.meshIndex); //                   +2 = 26
          offset += writeU16(dst, offset, entity.materialIndex); //               +2 = 28
          // total 28 bytes, 4 bytes free
        },
      }),
      world: this.device.createBuffer({
        label: "Entities world",
        size: this.device.limits.maxStorageBufferBindingSize,
        // TODO: COPY_DST -> COPY_SRC
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      bounds: this.device.createBuffer({
        label: "Entities bounds",
        size: this.device.limits.maxStorageBufferBindingSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      }),
    };
    for (const [id, entity] of args.scene ?? []) {
      this.setEntity([id], entity);
    }

    this.meshes = {
      resources: new Map(args.resources?.meshes),
      data: new GPUStore(this.device, {
        label: "Meshes",
        size: 32 * MAX_U16_VALUE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        stride: 32,
        serialize: (mesh, dst) => {
          let offset = 0;
          offset += writeVec3(dst, offset, mesh.bounds.center); //  +12 = 12
          offset += writeVec3(dst, offset, mesh.bounds.extents); // +12 = 24
          offset += writeF32(dst, offset, mesh.bounds.radius); //    +4 = 28
          // total 32 bytes, 4 bytes free
        },
      }),
    };

    this.sorted = {
      spatial: this.device.createBuffer({
        label: "Sorted spatial",
        size: this.device.limits.maxStorageBufferBindingSize, // TODO: adjust to max entities
        // TODO: COPY_DST -> COPY_SRC
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    };

    this.draws = {
      // https://developer.mozilla.org/en-US/docs/Web/API/GPURenderPassEncoder/drawIndexedIndirect
      opaque: new GPUArena(this.device, {
        label: "Meshes draws",
        size: 20 * MAX_U16_VALUE,
        // TODO: COPY_DST -> COPY_SRC
        usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
        serialize: (draw) => {
          const dst = new ArrayBuffer(20);
          let offset = 0;
          offset += writeU32(dst, offset, draw.indexCount); //    +4 = 4  [ 0] const from creation
          offset += writeU32(dst, offset, draw.instanceCount); // +4 = 8  [ 4] set by 'visible' pass
          offset += writeU32(dst, offset, draw.firstIndex); //    +4 = 12 [ 8] const from creation
          offset += writeU32(dst, offset, draw.baseVertex); //    +4 = 16 [12] const from creation
          offset += writeU32(dst, offset, draw.firstInstance); // +4 = 20 [16] set by 'prefix sum' pass
          // total 20 bytes, 0 bytes free
          return dst;
        },
      }),
      instances: this.device.createBuffer({
        label: "Draws instances",
        size: this.device.limits.maxStorageBufferBindingSize / 8, // only u32, limited by entities buffer size
        // TODO: COPY_DST -> COPY_SRC
        usage:
          GPUBufferUsage.STORAGE |
          // GPUBufferUsage.VERTEX |
          GPUBufferUsage.COPY_DST,
      }),
    };

    this.materials = {
      resources: new Map(args.resources?.materials),
      data: new GPUStore(this.device, {
        label: "Materials",
        size: 32 * 0xffff, // u16 index, so max size is 0xffff
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        stride: 32,
        serialize: (material) => { },
      }),
    };

    // lights
    // bounds

    this.depthTexture = this.createDepthTexture(args.width, args.height);
    this.passes = {
      flatten: new GPUComputePass(this.device, {
        label: "Compute flatten",
        bindings: [
          { type: "uniform", buffer: this.sizes },
          { type: "read-only-storage", buffer: this.entities.local.buffer },
          { type: "storage", buffer: this.entities.world },
          { type: "storage", buffer: this.entities.bounds },
        ],
        code: shaderFlatten,
      }),

      opaque: new GPURenderPass(this.device, {
        label: "Render opaque",
        primitive: {
          topology: "triangle-list",
          cullMode: "back",
        },
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: "less",
          format: "depth24plus",
        },
        bindings: [
          {
            type: "uniform",
            visibility: GPUShaderStage.VERTEX,
            buffer: this.camera.buffer,
          },
          {
            type: "read-only-storage",
            visibility: GPUShaderStage.VERTEX,
            buffer: this.entities.world,
          },
          {
            type: "read-only-storage",
            visibility: GPUShaderStage.VERTEX,
            buffer: this.draws.instances,
          },
        ],
        code: shaderRender,
      }),
    };
  }

  draw() {
    const encoder = this.device.createCommandEncoder();

    //    | Name        | Task
    //  1 | Reset       | Zero out the Indirect Draw and Count buffers.
    //  2 | Commands    | "Process CPU-driven changes (movement, state changes)."
    //  3 | Physics     | "Resolve constraints, collisions, and wind for hair/fur."
    //  _ | Skinning    | Calculates "Bone palette" for animated entites and writes a "kones" buffer
    //  4 | Flatten     | Bake hierarchy into World Matrices; update AABBs.
    //  5 | Sort        | Radix sort Morton codes for spatial coherence.
    //  6 | BVH         | Construct/Refit the acceleration structure.
    //  7 | Visible     | Frustum/Small/Occlusion culling + LOD selection.
    //  8 | Scan        | Prefix sum on counts to find memory offsets.
    //  9 | Instances   | Fill the final buffer with entity IDs for the draw calls.
    // 10 | Depth       | The Opaque Z-Prepass (for Early-Z optimization).
    // 11 | Opaque      | Main color pass for solid geometry.
    // 12 | Transparent | Alpha-blending or OIT pass for Love or hair tips.

    // Compute flatten
    this.passes.flatten.dispatch(
      encoder,
      Math.ceil(this.entities.local.size() / 64),
    );

    // TODO: REMOVE THIS
    {
      // TODO: Compute reset
      // TODO: Compute commands (64b size, u16 indexed)
      // TODO: Compute flatten (prediction: world/bounds for physics to use)
      // TODO: Compute physics (updates local, needs to re-flatten world/bounds)

      // TODO: Compute flatten (correction: final world positions/bounds)
      for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const pos = [-i * 0.2, 0, -i * 0.1];
        const rot = [0, 0, 0, 1];
        const scale = 1;
        this.device.queue.writeBuffer(
          this.entities.world, // by entities.local
          i * 32, // offset
          new Float32Array([...pos, scale, ...rot]),
        );
      }

      // TODO: Compute sort
      // TODO: Compute spatial
      // TODO: Compute BVH
      // - parent index: u32
      // - skip index: u32
      // - child or entity index: u32
      // - entities count: u16

      // - bounding sphere: vec4<f32> (center+radius)
      // - global illumination: 3 x vec4<f16> (3x RGBA f16)
      // - ambient: vec3<f16> (rgb)
      // - directional: mat3x3<f16> (rgb)
      // --- alternative for Spherical Harmonics (SH) -- 16b aligned
      // sh_red: vec4<f16>    L0 (ambient) + L1 (directional)
      // sh_green: vec4<f16>  L0 (ambient) + L1 (directional)
      // sh_blue: vec4<f16>   L0 (ambient) + L1 (directional)

      // TODO: Compute visible
      // Workaround: assume all entities are visible
      const instanceCount = 3;
      const instanceCountOffset = 4; // set by 'visible' pass
      this.device.queue.writeBuffer(
        this.draws.opaque.buffer, // by mesh-lod
        instanceCountOffset,
        new Uint32Array([instanceCount]),
      );

      // TODO: Compute scan (prefix sum)
      //  read:  draws.instances.count
      //  write: draws.instances.first (index, not offset bytes)
      const firstInstance = 2;
      const firstInstanceOffset = 16; // set by 'prefix sum' pass
      this.device.queue.writeBuffer(
        this.draws.opaque.buffer, // by mesh-lod
        firstInstanceOffset,
        new Uint32Array([firstInstance]),
      );

      // TODO: Compute instances (compaction)
      //  read: sorted.spatial (entity_index)
      //  read: sorted.flags (is_visible) -- camera + per shadow-casting light
      //    NOTE: Per render target (main camera, shadow-casting light, reflection, etc)
      //      low-tier:  4 sources (1 camera + 3 shadow/reflection sources)
      //      mid-tier:  8 sources (1 camera + 7 shadow/reflection sources)
      //      high-tier: 16 sources (1 camera + 15 shadow/reflection sources)
      //      - sorted.spatial
      //      - sorted lights
      //      - draws
      this.device.queue.writeBuffer(
        this.draws.instances, // by mesh-lod firstInstance
        0,
        // Indices to entities.world
        new Uint32Array([0, 2, 5, 7, 1]),
      );
    }

    // Render depth (Hi-Z for occlusion cullingg)

    // Render opaque
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
    pass.setPipeline(this.passes.opaque.pipeline);
    pass.setBindGroup(0, this.passes.opaque.bindGroup);
    pass.setVertexBuffer(0, this.vertices.buffer);
    pass.setIndexBuffer(this.faces.buffer, "uint32");
    for (const slot of this.draws.opaque.values()) {
      pass.drawIndexedIndirect(this.draws.opaque.buffer, slot.offset);
    }

    // Render transparent

    pass.end();
    this.device.queue.submit([encoder.finish()]);
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
    if (DEBUG.CAMERA_CHANGE) {
      console.debug("[debug] camera.viewProjection", this.camera.projection);
    }
    this.device.queue.writeBuffer(
      this.camera.buffer,
      Renderer.CAMERA_VIEW_PROJECTION_OFFSET,
      this.camera.viewProjection as Float32Array<ArrayBuffer>,
    );
  }

  addVertices(id: MeshId, vertices: Vertex[]): GPUArenaSlot {
    let slot = this.vertices.get(id);
    if (slot === undefined) {
      if (vertices.length === 0) {
        return { offset: this.vertices.NULL, size: 0 };
      }
      slot = this.vertices.add(id, vertices);
      if (DEBUG.VERTICES_ADD) {
        console.debug("[debug] vertices:", id, vertices, slot);
      }
    }
    return slot;
  }

  addFaces(id: MeshLodId, faces: Face[]): GPUArenaSlot {
    let slot = this.faces.get(id);
    if (slot === undefined) {
      slot = this.faces.add(id, faces);
      if (DEBUG.FACES_ADD) {
        console.debug("[debug] faces:", id, faces, slot);
      }
    }
    return slot;
  }

  addMesh(id: MeshId, mesh: Mesh): MeshIdx {
    let entry: Mesh = { vertices: [], lods: ['', '', '', ''] };
    let meshIdx = this.meshes.get(id);
    if (meshIdx === undefined) {
      console.log(id, mesh);
      if (typeof mesh.vertices === 'string') {
        entry.vertices = mesh.vertices;
      } else {
        this.addVertices(id, mesh.vertices);
        entry.vertices = id;
      }
      for (const lod of [0, 1, 2, 3]) {
        if (mesh.lods[lod]) {
          if (typeof mesh.lods[lod] === 'string') {
            entry.lods[lod] = mesh.lods[lod];
          } else {
            const meshLodId = `${id}:${lod}`;
            this.addFaces(meshLodId, mesh.lods[lod]);
            entry.lods[lod] = meshLodId;
          }
        }
      }
      if (mesh.bounds) {
        entry.bounds = mesh.bounds;
      } else if (typeof mesh.vertices !== 'string') {
        entry.bounds = getMeshBounds(mesh.vertices);
      }
      meshIdx = this.meshes.add(id, entry);
    }
    return meshIdx;
  }

  addMaterial(id: MaterialId, material: Material): number {
    return 0xFFFF;
  }

  setEntity(
    path: EntityId[],
    entity: Entity,
    parentIndex?: number,
  ): EntityIndex {
    const id = path.join("/");
    let index = this.entities.local.get(id);
    if (index === undefined) {
      const entityData = {
        transform: entity.transform ?? new Transform(),
        meshIndex: this.addMesh(entity.meshId),
        materialIndex: this.materials.data.NULL,
        parentIndex: parentIndex ?? this.entities.local.NULL,
      };
      index = this.entities.local.add(id, entityData);
      this.device.queue.writeBuffer(
        this.sizes,
        Renderer.SIZES_ENTITIES.offset,
        new Uint32Array([this.entities.local.size()]),
      );
      for (const [childId, child] of entity.children ?? []) {
        this.setEntity([...path, childId], child, index);
      }
    }
    return index;
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

  async shaderCompilationMessages(shaderModule: GPUShaderModule): Promise<{
    info: string[];
    warnings: string[];
    errors: string[];
  }> {
    const compilationInfo = await shaderModule.getCompilationInfo();
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

function getMeshBounds(vertices: Vertex[]): MeshBounds {
  const [head, ...tail] = vertices;
  if (head === undefined) {
    return {
      min: vec3.create(),
      max: vec3.create(),
    };
  }
  const min = vec3.copy(head.position);
  const max = vec3.copy(head.position);
  for (const vertex of tail) {
    vec3.min(vertex.position, min, min);
    vec3.max(vertex.position, max, max);
  }
  return { min, max };
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
