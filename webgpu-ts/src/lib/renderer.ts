import { mat4, vec3, type Mat4, type Quat, type Vec3 } from "wgpu-matrix";
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
  INDICES_ADD: true,
  ENTITY_ADD: true,
  MESH_ADD: true,
  MATERIAL_ADD: true,
  DRAW_ADD: true,
};

export const MAX_U16_VALUE = 0xffff;
export const MAX_U32_VALUE = 0xffffffff;

export type FilePattern = string;
// export type ResourceLoader = () => void;

export type MeshId = string;
export type MeshLodId = string;
export type MeshIndex = number;
export interface MeshBounds {
  center: Vec3; // 12b
  extents: Vec3; // 12b
  radius: number; // 4b f32
}
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
}
export interface DrawCmd {
  // This order seems easier to reason about in the flow of things.
  // The number like [12] is the offset in bytes expected.
  // https://developer.mozilla.org/en-US/docs/Web/API/GPURenderPassEncoder/drawIndexedIndirect
  baseVertex: GPUSize32; //    [12] const from creation
  firstIndex: GPUSize32; //    [ 8] const from creation
  indexCount: GPUSize32; //    [ 0] const from creation
  instanceCount: GPUSize32; // [ 4] set by 'visible' pass
  firstInstance: GPUSize32; // [16] set by 'instances' pass
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
export interface EntityLocal {
  transform: Transform;
  parentIndex: EntityIndex;
  meshIndex: MeshIndex;
  materialIndex: MaterialIndex;
}
export interface EntityWorld {
  transform: Transform;
}
export interface EntityBounds {
  bounds: MeshBounds;
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
  vertices: GPUArena<MeshId, number[][]>;
  indices: GPUArena<MeshLodId, number[]>;
  entities: {
    local: GPUStore<EntityId, EntityLocal>;
    world: GPUBuffer;
    bounds: GPUBuffer;
  };
  meshes: {
    resources: Map<MeshId, Mesh>;
    data: GPUStore<MeshId, MeshData>;
  };
  materials: {
    resources: Map<MaterialId, Material>;
    data: GPUStore<MaterialId, MaterialData>;
  };
  // lights
  // bounds
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
        const values = vertices.flatMap((xs) => toFixedLength(xs, 8, 0));
        return new Float32Array(values);
      },
    });

    this.indices = new GPUArena(this.device, {
      label: "Indices",
      size: this.device.limits.maxBufferSize,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      serialize: (indices) => {
        return new Uint32Array(indices);
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
          offset += writeU32(dst, offset, draw.firstInstance); // +4 = 20 [16] set by 'instances' pass
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
          GPUBufferUsage.VERTEX |
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
        serialize: (material) => {},
      }),
    };

    // lights
    // bounds

    this.depthTexture = this.createDepthTexture(args.width, args.height);

    const types = {
      Sizes: /* wgsl */ `
      struct Sizes {
        entities: u32,
        meshes: u32,
        materials: u32,
      };`,
      Camera: /* wgsl */ `
      struct Camera {
        view_projection: mat4x4f,
      };`,
      EntityLocal: /* wgsl */ `
      struct EntityLocal {
        position: vec3f,          // +12 = 12
        rotation_packed: u32,     //  +4 = 16
        scale: f32,               //  +4 = 20
        parent_index: u32,        //  +4 = 24
        mesh_material_index: u32, //  +4 = 28
        _padding: u32,            //  +4 = 32
      };`,
      EntityWorld: /* wgsl */ `
      struct EntityWorld {
        position_scale: vec4f, // +16 = 16
        rotation: vec4f,       // +16 = 32
      };`,
      EntityBounds: /* wgsl */ `
      struct EntityBounds {
        center: vec3f,  // +12 = 12
        radius: f32,    //  +4 = 16
        extents: vec3f, // +12 = 28
        _padding: u32,  //  +4 = 32
      };`,
    };

    const functions = {
      // https://reingd.substack.com/p/animation-compression?utm_medium=reader2
      quat_unpack: /* wgsl */ `
      fn quat_unpack(packed: u32) -> vec4f {
        let max_idx = packed >> 30u;
        let a = f32((packed >> 20u) & 1023u) / 1023.0 * 1.414214 - 0.707107;
        let b = f32((packed >> 10u) & 1023u) / 1023.0 * 1.414214 - 0.707107;
        let c = f32(packed & 1023u) / 1023.0 * 1.414214 - 0.707107;
        let d = sqrt(1.0 - (a*a + b*b + c*c));

        if (max_idx == 0u) { return vec4f(d, a, b, c); }
        if (max_idx == 1u) { return vec4f(a, d, b, c); }
        if (max_idx == 2u) { return vec4f(a, b, d, c); }
        return vec4<f32>(a, b, c, d);
      }`,
      transform_matrix: /* wgsl */ `
alias quat = vec4f;
fn transform_matrix(pos: vec3f, rotation: quat, scale: f32) -> mat4x4f {
  // https://github.com/greggman/wgpu-matrix/blob/31963458dcafa4cf430d981afd9b31bc5eba55e3/src/mat4-impl.ts#L193
  // https://github.com/greggman/wgpu-matrix/blob/31963458dcafa4cf430d981afd9b31bc5eba55e3/src/mat4-impl.ts#L1546
  let rx = rotation.x; let ry = rotation.y; let rz = rotation.z; let rw = rotation.w;
  let x2 = rx + rx; let y2 = ry + ry; let z2 = rz + rz;

  let xx = rx * x2;
  let yx = ry * x2;
  let yy = ry * y2;
  let zx = rz * x2;
  let zy = rz * y2;
  let zz = rz * z2;
  let wx = rw * x2;
  let wy = rw * y2;
  let wz = rw * z2;

  return mat4x4f(
    vec4f(1 - yy - zz,     rx + wz,     zx - wy, 0) * scale, // right 
    vec4f(    rx - wz, 1 - xx - zz,     zy + wx, 0) * scale, // up
    vec4f(    zx + wy,     zy - wx, 1 - xx - yy, 0) * scale, // forward 
    vec4f(      pos.x,       pos.y,       pos.z, 1),
  );
}

      `,
    };

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
    // Compute flatten
    this.passes.flatten.dispatch(
      encoder,
      Math.ceil(this.entities.local.size() / 64),
    );

    // TODO: REMOVE THIS
    {
      // TODO: Compute flatten
      const pos = [0, 0, 0];
      const rot = [0, 0, 0, 1];
      const scale = 1;
      this.device.queue.writeBuffer(
        this.entities.world,
        0, // offset
        new Float32Array([...pos, scale, ...rot]),
      );

      // TODO: Compute visible
      const instanceCountOffset = 4; // set by 'visible' pass
      const instanceCount = new Uint32Array([1]);
      this.device.queue.writeBuffer(
        this.draws.opaque.buffer,
        instanceCountOffset,
        instanceCount,
      );

      // TODO: Compute instances
      const firstInstance = 0;
      const instances = new Uint32Array([0]);
      this.device.queue.writeBuffer(
        this.draws.instances,
        firstInstance * Uint32Array.BYTES_PER_ELEMENT,
        instances,
      );
    }

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
    pass.setIndexBuffer(this.indices.buffer, "uint32");
    for (const slot of this.draws.opaque.values()) {
      pass.drawIndexedIndirect(this.draws.opaque.buffer, slot.offset);
    }

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
        meshIndex: this.setMesh(entity.meshId),
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

  setVertices(id: MeshId, vertices: number[][]): GPUArenaSlot {
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

  setIndices(
    id: MeshLodId,
    draw: { arena: GPUArena<MeshLodId, DrawCmd>; baseVertex: number },
    indices: number[] | undefined,
    fallback?: GPUArenaSlot,
  ): GPUArenaSlot {
    let slot = this.indices.get(id);
    if (slot === undefined) {
      if (!indices || indices.length === 0) {
        if (fallback) {
          const cmd = {
            baseVertex: draw.baseVertex,
            firstIndex: Math.floor(
              fallback.offset / Uint32Array.BYTES_PER_ELEMENT,
            ),
            indexCount: Math.floor(
              fallback.size / Uint32Array.BYTES_PER_ELEMENT,
            ),
            firstInstance: 0,
            instanceCount: 0,
          };
          draw.arena.add(id, cmd);
          if (DEBUG.DRAW_ADD) {
            console.debug("[debug] draw:", id, cmd);
          }
          return fallback;
        }
        return { offset: this.indices.NULL, size: 0 };
      }
      slot = this.indices.add(id, indices);
      if (DEBUG.INDICES_ADD) {
        console.debug("[debug] indices:", id, indices, slot);
      }
      // https://developer.mozilla.org/en-US/docs/Web/API/GPURenderPassEncoder/drawIndexedIndirect
      const cmd = {
        baseVertex: draw.baseVertex,
        firstIndex: Math.floor(slot.offset / Uint32Array.BYTES_PER_ELEMENT),
        indexCount: Math.floor(slot.size / Uint32Array.BYTES_PER_ELEMENT),
        instanceCount: 0, // set by 'visible' pass
        firstInstance: 0, // start instance_id at 0
      };
      draw.arena.add(id, cmd);
      if (DEBUG.DRAW_ADD) {
        console.debug("[debug] draw:", id, cmd);
      }
    }
    return slot;
  }

  setMesh(id: MeshId | undefined): MeshIndex {
    if (id === undefined) {
      return this.meshes.data.NULL;
    }
    let index = this.meshes.data.get(id);
    if (index === undefined) {
      const mesh = this.meshes.resources.get(id);
      if (mesh === undefined) {
        console.error(`Undefined mesh resource: ${id}`);
        return this.meshes.data.NULL;
      }
      if (mesh.fromFile) {
        console.error("TODO: Renderer.streamMesh fromFile");
      }
      const vertices = mesh.vertices ?? [];
      const meshData: MeshData = {
        bounds: mesh.bounds ?? getMeshBounds(vertices),
      };
      index = this.meshes.data.add(id, meshData);
      this.device.queue.writeBuffer(
        this.sizes,
        Renderer.SIZES_MESHES.offset,
        new Uint32Array([this.meshes.data.size()]),
      );
      if (DEBUG.MESH_ADD) {
        console.debug("[debug] mesh:", id, meshData, index);
      }
      const draw = {
        // TODO: check material to decide to which arena it goes to.
        arena: this.draws.opaque,
        baseVertex: Math.floor(this.setVertices(id, vertices).offset / 32),
      };
      const lod0 = this.setIndices(`${id}:0`, draw, mesh.lod0);
      const lod1 = this.setIndices(`${id}:1`, draw, mesh.lod1, lod0);
      const lod2 = this.setIndices(`${id}:2`, draw, mesh.lod2, lod1);
      const lod3 = this.setIndices(`${id}:3`, draw, mesh.lod3, lod2);
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
