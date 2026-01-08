import {
  mat4,
  type Mat4,
  type Mat4Arg,
  type Quat,
  type QuatArg,
  type Vec2,
  type Vec3,
  type Vec3Arg,
  type Vec4,
} from "wgpu-matrix";
import {
  EmptyAsset,
  getAssetID,
  isLowerLOD,
  LoadingAsset,
  MeshAsset,
  type Asset,
  type AssetID,
  type AssetLOD,
  type RequestID,
} from "./asset";
import type { Entity, EntityID } from "./entity";
import type { Scene } from "./scene";
import { VertexBuffer } from "./assets/vertexBuffer";
import { IndexBuffer } from "./assets/indexBuffer";
import {
  getResourceID,
  type Resource,
  type ResourceID,
  type ResourceLoader,
} from "./resource";
import type { FilePattern } from "./engine";
import { loadObj } from "./loaders/mesh.obj";
import { Transform } from "./transform";

// export interface SceneNode {
//   resource: Resource;
//   transform: Transform;
//   children: Map<EntityID, SceneNode>;
// }
// export interface MeshLOD {
//   vertexOffset: number;
//   indexOffset: number;
//   indexCount: number;
// }
// export interface MeshAsset {
//   lod0: MeshLOD;
//   lod1: MeshLOD;
//   lod2: MeshLOD;
//   lod3: MeshLOD;
// }
// export interface MeshNode {
//   position: Vec3;
//   orientation: Quat;
//   scale: Vec3;
//   parent: number;
//   meshIndex: number;
//   aabb: {
//     min: Vec3;
//     max: Vec3;
//   };
// }

// export interface MeshBatch {
//   meshLOD: MeshLOD;
//   instanceIndices: number[];
// }
// export interface DrawCall {
//   vertexOffset: number;
//   indexOffset: number;
//   indexCount: number;
//   instanceOffset: number;
//   instanceCount: number;
// }

export type EntityIndex = number;
export interface EntityData {
  transform: Transform;
  resource: Resource;
}

export interface VertexData {
  position: Vec3;
  normal: Vec3;
  uv: Vec2;
}

export class Renderer {
  static readonly Binding = {
    CAMERA: 0,
    INSTANCES: 1,
    ENTITIES: 2,
    ENTITIES_BVH: 3,
    LIGHTS: 4,
    LIGHTS_BVH: 5,
    MATERIALS: 6,
    TEXTURES: 7,
  };

  static readonly CAMERA_VIEW_PROJECTION_OFFSET = 0;
  static readonly CAMERA_VIEW_PROJECTION_SIZE = 4 * 4;
  static readonly CAMERA_SIZE =
    this.CAMERA_VIEW_PROJECTION_SIZE * Float32Array.BYTES_PER_ELEMENT;

  static readonly ENTITY_TRANSFORM_OFFSET = 0;
  static readonly ENTITY_TRANSFORM_SIZE = 4 * 4;
  static readonly ENTITY_STRIDE = 128;

  device: GPUDevice;
  assets: Map<AssetID, Asset>;
  loading: Map<RequestID, Promise<Resource>>;
  loaders: Record<FilePattern, ResourceLoader>;
  camera: {
    viewProjection: Mat4;
    buffer: GPUBuffer;
  };
  entities: StorageBlock<EntityID, Entity>;
  geometry: {
    vertices: StorageDynamic<AssetID, VertexData[]>;
    indices: StorageDynamic<AssetID, number[]>;
  };
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  constructor(args: {
    device: GPUDevice;
    loaders?: Record<AssetID, ResourceLoader>;
  }) {
    this.device = args.device;
    this.assets = new Map();
    this.loading = new Map();
    this.loaders = {
      ...args.loaders,
      "*.obj": loadObj,
    };

    this.camera = {
      viewProjection: mat4.identity(),
      buffer: this.device.createBuffer({
        label: "Camera",
        size: Renderer.CAMERA_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    };

    this.entities = new StorageBlock({
      device: this.device,
      label: "Entitites",
      maxSize: this.device.limits.maxStorageBufferBindingSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      stride: 64,
      serialize: (entities, dst) => {
        for (const { value: entity, offset } of entities) {
          entity.transform.serialize(new Float32Array(dst, offset));
        }
        return dst;
      },
    });

    this.geometry = {
      vertices: new StorageDynamic({
        device: this.device,
        label: "Vertices",
        maxSize: this.device.limits.maxBufferSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        sizeOf: (xs) => 8 * xs.length * Float32Array.BYTES_PER_ELEMENT,
      }),
      indices: new StorageDynamic({
        device: this.device,
        label: "Indices",
        maxSize: this.device.limits.maxBufferSize,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        sizeOf: (xs) => xs.length * Uint32Array.BYTES_PER_ELEMENT,
      }),
    };

    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: "Stage",
      entries: [
        {
          binding: Renderer.Binding.CAMERA,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
        // {
        //   binding: Stage.Binding.INSTANCES,
        //   visibility: GPUShaderStage.VERTEX,
        //   buffer: { type: "read-only-storage" },
        // },
        {
          binding: Renderer.Binding.ENTITIES,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
        // {
        //   binding: Stage.Binding.ENTITIES_BVH,
        //   visibility: GPUShaderStage.VERTEX,
        //   buffer: { type: "read-only-storage" },
        // },
        // {
        //   binding: Stage.Binding.LIGHTS,
        //   visibility: GPUShaderStage.VERTEX,
        //   buffer: { type: "read-only-storage" },
        // },
        // {
        //   binding: Stage.Binding.LIGHTS_BVH,
        //   visibility: GPUShaderStage.VERTEX,
        //   buffer: { type: "read-only-storage" },
        // },
        // {
        //   binding: Stage.Binding.MATERIALS,
        //   visibility: GPUShaderStage.VERTEX,
        //   buffer: { type: "read-only-storage" },
        // },
        // {
        //   binding: Stage.Binding.TEXTURES,
        //   visibility: GPUShaderStage.VERTEX,
        //   buffer: { type: "read-only-storage" },
        // },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      label: "Stage",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: Renderer.Binding.CAMERA,
          resource: this.camera.buffer,
        },
        // {
        //   binding: Stage.Binding.INSTANCES,
        //   resource: this.instances.buffer,
        // },
        {
          binding: Renderer.Binding.ENTITIES,
          resource: this.entities.buffer,
        },
        // {
        //   binding: Stage.Binding.ENTITIES_BVH,
        //   resource: this.entities.bvh.buffer,
        // },
        // { binding: Stage.Binding.LIGHTS, resource: this.lights.buffer },
        // { binding: Stage.Binding.LIGHTS_BVH, resource: this.lightsBVH.buffer },
        // { binding: Stage.Binding.MATERIALS, resource: this.materials.buffer },
        // { binding: Stage.Binding.TEXTURES, resource: this.textures.buffer },
      ],
    });
  }

  setCameraViewProjection(m: Mat4Arg) {
    this.camera.viewProjection = m as Mat4;
    this.device.queue.writeBuffer(
      this.camera.buffer,
      Renderer.CAMERA_VIEW_PROJECTION_OFFSET,
      m as Float32Array<ArrayBuffer>,
      Renderer.CAMERA_VIEW_PROJECTION_SIZE,
    );
  }

  remove(id: EntityID) {
    console.error("TODO: Stage.remove -- remove one entity");
  }

  load(entities: [EntityID, Entity][]) {
    for (const [id, entity] of entities) {
      this.entities.add(id, entity);
    }
  }

  unload(ids?: EntityID[]) {
    console.error("TODO: Stage.unload -- remove selected or all entities");
  }

  findLOD(entity: EntityData): AssetLOD {
    // TODO: use camera distance, bounding radius size, and morton codes
    return 0;
  }

  // TODO: This must be done after loading, when lod is known
  // // Add the instance's entity ID, only for Mesh.
  // if (entity.resource.tag === "Mesh") {
  //   const resourceID = getResourceID(entity.resource);
  //   let instances = this.instances.values.get(resourceID);
  //   if (instances === undefined) {
  //     instances = new Set();
  //     this.instances.values.set(resourceID, instances);
  //   }
  //   instances.add(entityIndex);
  // }

  request(
    resource: Resource,
    lod: AssetLOD = 0,
  ): { id: AssetID; asset: Asset } {
    const id = getAssetID(resource, lod);
    let asset = this.assets.get(id);
    if (!asset) {
      // Not loaded, try to load it.
      asset = this.loadAsset(id, resource, lod);
      this.assets.set(id, asset);
    }
    if (asset.tag === "LoadingAsset") {
      // Still loading, try to find a lower LOD.
      const lowerAssetId = [...this.assets.keys()]
        .filter((id2) => isLowerLOD(id, id2))
        .sort()[0];
      if (lowerAssetId !== undefined) {
        return { id, asset: this.assets.get(lowerAssetId)! };
      }
    }
    // Nothing else to try, return whatever `loadAsset` gave us.
    // This could either be Loading or a AssetError.
    return { id, asset };
  }

  loadAsset(id: AssetID, resource: Resource, lod: AssetLOD): Asset {
    switch (resource.tag) {
      case "Empty":
        return EmptyAsset();

      case "Reference":
        let request = this.loading.get(id);
        if (request === undefined) {
          // Create a new request.
          const loader = this.findFileLoader(resource.filename);
          if (loader === undefined) {
            throw new Error(
              `[LibraryMesh3D.load] Could not find a loader for: ${id}`,
            );
          }
          request = loader(resource.filename, lod)
            .then((resource) => {
              this.loading.delete(id);
              this.assets.delete(id);
              return this.request(resource);
            })
            .catch((e) => {
              return e;
            })
            .finally(() => {});
        }
        return LoadingAsset(id);

      case "Mesh":
        throw new Error("TODO: write to vertex and index buffers");
      // return MeshAsset({
      //   vertices: this.geometry.vertices.write(resource.vertices),
      //   indices: this.geometry.indices.write(resource.indices),
      // });

      case "Camera":
        return EmptyAsset();

      default:
        throw new Error(
          `Engine.loadAsset: not implemented: ${(resource as Resource).tag}`,
        );
    }
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
}

export class StorageBlock<k, v> {
  readonly device: GPUDevice;
  readonly label: string;
  readonly buffer: GPUBuffer;
  readonly maxSize: number;
  readonly stride: number;
  readonly serialize: (
    entries: { value: v; offset: number }[],
    dst: ArrayBuffer,
  ) => ArrayBufferLike;
  indices: Map<k, number>;
  values: v[];
  freeList: number[];
  constructor(args: {
    device: GPUDevice;
    label: string;
    maxSize: number;
    usage: number;
    stride: number;
    serialize: (
      entries: { value: v; offset: number }[],
      dst: ArrayBuffer,
    ) => ArrayBufferLike;
  }) {
    this.device = args.device;
    this.label = args.label;
    this.buffer = this.device.createBuffer({
      label: args.label,
      size: args.maxSize,
      usage: args.usage,
    });
    this.maxSize = args.maxSize;
    this.stride = args.stride;
    this.serialize = args.serialize;
    this.indices = new Map();
    this.values = [];
    this.freeList = [];
  }

  clear() {
    this.indices.clear();
    this.values = [];
    this.freeList = [];
  }

  set(entries: [k, v][]): number[] {
    this.clear();
    // TODO: check for maximum storage
    this.indices = new Map(entries.map(([key, _], index) => [key, index]));
    this.values = [...entries.map(([_, value]) => value)];
    const values = this.values.map((entry, i) => ({
      value: entry,
      offset: i * this.stride,
    }));
    const data = new ArrayBuffer(entries.length * this.stride);
    this.serialize(values, data);
    this.device.queue.writeBuffer(this.buffer, 0, data);
    return [...this.values.keys()];
  }

  // TODO: Optimize this
  // - make sure freeList is always sorted
  // - find with binary search
  // - when inserting a free slot, check if it can be merged
  findFreeIndex(): number | undefined {
    let slot = this.freeList.pop();
    if (slot !== undefined) {
      return slot;
    }
    if (this.values.length * this.stride >= this.maxSize) {
      console.error(`[${this.label}] maximum storage reached`);
      return undefined;
    }
    return this.values.length;
  }

  add(key: k, value: v): number | undefined {
    const index = this.findFreeIndex();
    if (index === undefined) {
      return undefined;
    }
    this.indices.set(key, index);
    if (index < this.values.length) {
      this.values[index] = value;
    } else {
      this.values.push(value);
    }
    const offset = index * this.stride;
    const data = new ArrayBuffer(this.stride);
    this.serialize([{ value, offset: 0 }], data);
    this.device.queue.writeBuffer(this.buffer, offset, data);
    return index;
  }
}

export interface StorageDynamicSlot {
  offset: number;
  size: number;
}
export class StorageDynamic<k, v> {
  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
  readonly maxSize: number;
  readonly sizeOf: (value: v) => number;
  offsets: Map<k, number>;
  values: Map<number, v>;
  freeList: StorageDynamicSlot[];
  constructor(args: {
    device: GPUDevice;
    label?: string;
    maxSize: number;
    usage: number;
    sizeOf: (value: v) => number;
  }) {
    this.device = args.device;
    this.buffer = this.device.createBuffer({
      label: args.label,
      size: args.maxSize,
      usage: args.usage,
    });
    this.maxSize = args.maxSize;
    this.sizeOf = args.sizeOf;
    this.offsets = new Map();
    this.values = new Map();
    this.freeList = [{ offset: 0, size: this.maxSize }];
  }

  clear() {
    this.offsets.clear();
    this.values.clear();
    this.freeList = [{ offset: 0, size: this.maxSize }];
  }

  // TODO: Optimize this
  // - make sure freeList is always sorted
  // - find with binary search
  // - when inserting a free slot, check if it can be merged
  findFreeSlot(size: number): StorageDynamicSlot | undefined {
    for (const [slotID, slot] of this.freeList.entries()) {
      if (slot.size >= size) {
        if (slot.size > size) {
          // Create a smaller free entry for the remainder.
          this.freeList.push({
            offset: slot.offset + size,
            size: slot.size - size,
          });
        }
        // Delete the entry from the free list we just used.
        this.freeList.splice(slotID, 1);
        return { offset: slot.offset, size };
      }
    }
    return undefined;
  }

  add(key: k, value: v): StorageDynamicSlot | undefined {
    const slot = this.findFreeSlot(this.sizeOf(value));
    if (slot === undefined) {
      return undefined;
    }
    this.offsets.set(key, slot.offset);
    this.values.set(slot.offset, value);
    return slot;
  }
}
