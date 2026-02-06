import { vec3, type Vec2Arg, type Vec3, type Vec3Arg } from "wgpu-matrix";
import { GPUHeap, type GPUHeapSlot } from "./gpu/heap";
import { GPUPool, type GPUIndex } from "./gpu/pool";
import type { Transform } from "./transform";

export interface Vertex {
  position: Vec3Arg;
  normal: Vec3Arg;
  uv: Vec2Arg;
}
export type Index = number;

export interface Geometry {
  vertices: Vertex[];
  indices: {
    lod0: Index[];
    lod1?: Index[];
    lod2?: Index[];
    lod3?: Index[];
  };
}
export interface GeometryRef {
  vertices: GPUHeapSlot;
  indices: [GPUHeapSlot, GPUHeapSlot, GPUHeapSlot, GPUHeapSlot];
}

export type MeshId = number;
export type MeshName = string;
export interface Mesh {
  geometry: () => Geometry,
  bounds?: {
    min?: Vec3Arg;
    max?: Vec3Arg;
  };
}
export interface MeshBounds {
  min: Vec3;
  max: Vec3;
  scale: number;
}
export interface MeshRef {
  bounds: MeshBounds;
}

export type MaterialId = number;
export type MaterialName = string;
export interface Material {
}
export interface MaterialRef {
}

export type EntityId = number;
export type EntityName = string;
export interface Entity {
  transform?: Transform;
  children?: Record<EntityName, Entity>;
}
export interface EntityRef {
}

export class Meshes {
  static readonly MAX_CAPACITY = 0xFFFF;
  static readonly VERTICES_BLOCK_SIZE = 4;
  static readonly INDICES_BLOCK_SIZE = 32;
  static readonly BOUNDS_BLOCK_SIZE = 16;
  device: GPUDevice;
  capacity: number;
  entries: Map<MeshName, MeshRef>;
  loaders: Map<MeshName, () => Geometry>;
  geometries: GPUHeap;
  vertices: GPUPool;
  indices: GPUPool;
  bounds: GPUPool;
  constructor(device: GPUDevice, args: {
    capacity?: number;
    heapSize?: number;
  }) {
    this.device = device;
    this.capacity = args.capacity ?? Meshes.MAX_CAPACITY;
    if (this.capacity > Meshes.MAX_CAPACITY) {
      throw new Error(`Meshes are u16-indexed, capacity cannot exceed ${Meshes.MAX_CAPACITY}, got ${this.capacity}`);
    }
    this.entries = new Map();
    this.loaders = new Map();
    this.geometries = new GPUHeap(this.device, {
      buffer: this.device.createBuffer({
        label: 'geometries',
        size: args?.heapSize ?? Math.min(this.device.limits.maxBufferSize, mb(512)),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      }),
    });
    this.vertices = new GPUPool(this.device, {
      blockSize: Meshes.VERTICES_BLOCK_SIZE,
      buffer: this.device.createBuffer({
        label: 'meshes_vertices',
        size: this.capacity * Meshes.VERTICES_BLOCK_SIZE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    this.indices = new GPUPool(this.device, {
      blockSize: Meshes.INDICES_BLOCK_SIZE,
      buffer: this.device.createBuffer({
        label: 'meshes_indices',
        size: this.capacity * Meshes.INDICES_BLOCK_SIZE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    this.bounds = new GPUPool(this.device, {
      blockSize: Meshes.BOUNDS_BLOCK_SIZE,
      buffer: this.device.createBuffer({
        label: 'meshes_bounds',
        size: this.capacity * Meshes.BOUNDS_BLOCK_SIZE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
  };

  static getBounds(mesh: Mesh): MeshBounds {
    const min = vec3.create();
    const max = vec3.create();
    if (mesh.bounds?.min && mesh.bounds?.max) {
      vec3.copy(mesh.bounds.min, min);
      vec3.copy(mesh.bounds.max, max);
    } else {
      for (const v of mesh.geometry().vertices) {
        vec3.min(min, v.position);
        vec3.max(max, v.position);
      }
    }
    return { min, max, scale: this.getBoundsScale(min, max) };
  }
  static getBoundsScale(min: Vec3, max: Vec3): number {
    return Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
  }

  pool_size(): number {
    return this.vertices.buffer.size + this.indices.buffer.size + this.bounds.buffer.size;
  }
  heap_size(): number {
    return this.geometries.buffer.size;
  }

  add(name: MeshName, mesh: Mesh): MeshRef {
    const ref = this.entries.get(name);
    if (ref !== undefined) {
      return ref;
    }
    const entry: MeshRef = { bounds: Meshes.getBounds(mesh) };
    this.entries.set(name, entry);
    return entry;
  }

}

export class Renderer {
  device: GPUDevice;
  meshes: Meshes;
  constructor(device: GPUDevice, args?: {
    meshes: Record<MeshName, Mesh>,
    geometryHeapSize?: number,
    meshesPoolCapacity?: number,
  }) {
    this.device = device;
    this.meshes = new Meshes(this.device, {
      capacity: args?.meshesPoolCapacity,
      heapSize: args?.geometryHeapSize,
    });
  }

  draw() {
  }
}

export function kb(n: number): number {
  return n * 1024;
}
export function mb(n: number): number {
  return kb(n) * 1024;
}
export function gb(n: number): number {
  return mb(n) * 1024;
}
