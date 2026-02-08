import { vec3, type Vec3, type Vec3Arg } from "wgpu-matrix";
import { INT16_MAX, mb, UINT16_MAX, UINT32_MAX } from "./stdlib";
import { GPUHeap, type GPUHeapSlot } from "./gpu/heap";
import { GPUPool } from "./gpu/pool";
import type { Geometry, Mesh, MeshName } from "./scene";

export interface GeometryRef {
  vertices: GPUHeapSlot;
  indices: [GPUHeapSlot, GPUHeapSlot, GPUHeapSlot, GPUHeapSlot];
}

export type MeshId = number;
export interface MeshBounds {
  min: Vec3;
  max: Vec3;
  scale: number;
}
export interface MeshRef {
  id: MeshId;
  geometry: GeometryRef | undefined;
  bounds: MeshBounds;
}

export class Meshes {
  static readonly MAX_CAPACITY = UINT16_MAX;
  static readonly VERTICES_STRIDE = 4;
  static readonly INDICES_STRIDE = 32;
  static readonly BOUNDS_STRIDE = 16;
  static readonly GEOMETRY_VERTEX_STRIDE = 16;
  static readonly GEOMETRY_INDEX_STRIDE = 4;
  device: GPUDevice;
  capacity: number;
  entries: Map<MeshName, MeshRef>;
  loaders: Map<MeshName, () => Promise<Geometry>>;
  geometry: GPUHeap;
  vertices: GPUPool;
  indices: GPUBuffer;
  bounds: GPUBuffer;
  constructor(device: GPUDevice, args?: {
    capacity?: number;
    heapSize?: number;
  }) {
    this.device = device;
    this.capacity = args?.capacity ?? Meshes.MAX_CAPACITY;
    if (this.capacity > Meshes.MAX_CAPACITY) {
      throw new Error(`Meshes are u16-indexed, capacity cannot exceed ${Meshes.MAX_CAPACITY}, got ${this.capacity}`);
    }
    this.entries = new Map();
    this.loaders = new Map();
    this.geometry = new GPUHeap(this.device, {
      buffer: this.device.createBuffer({
        label: 'geometry',
        size: args?.heapSize ?? Math.min(this.device.limits.maxBufferSize, mb(512)),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      }),
    });
    this.vertices = new GPUPool(this.device, {
      blockSize: Meshes.VERTICES_STRIDE,
      buffer: this.device.createBuffer({
        label: 'meshes_vertices',
        size: this.capacity * Meshes.VERTICES_STRIDE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    this.indices = this.device.createBuffer({
      label: 'meshes_indices',
      size: this.capacity * Meshes.INDICES_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.bounds = this.device.createBuffer({
      label: 'meshes_bounds',
      size: this.capacity * Meshes.BOUNDS_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  };

  clear() {
    this.entries.clear();
    this.loaders.clear();
    this.geometry.clear();
    this.vertices.clear();
  }

  get(name: MeshName): MeshRef | undefined {
    return this.entries.get(name);
  }

  add(name: MeshName, mesh: Mesh): MeshRef {
    let ref = this.entries.get(name);
    if (ref === undefined) {
      ref = {
        id: this.vertices.alloc(),
        geometry: undefined,
        bounds: {
          min: vec3.copy(mesh.bounds.min),
          max: vec3.copy(mesh.bounds.max),
          scale: getBoundsScale(mesh.bounds.min, mesh.bounds.max),
        },
      };
    }
    this.entries.set(name, ref);
    this.loaders.set(name, mesh.loader);
    return ref;
  }

  setVertices(id: MeshId, offset: number) {
    this.vertices.write(id, new Uint32Array([offset]));
  }

  setIndices(
    id: MeshId,
    lod0: { offset: number, count: number; },
    lod1: { offset: number, count: number; },
    lod2: { offset: number, count: number; },
    lod3: { offset: number, count: number; },
  ) {
    const data = new ArrayBuffer(Meshes.INDICES_STRIDE);
    new Uint32Array(data, 0, 8).set([
      lod0.offset, lod0.count,
      lod1.offset, lod1.count,
      lod2.offset, lod2.count,
      lod3.offset, lod3.count,
    ]);
    this.device.queue.writeBuffer(this.indices, id * data.byteLength, data);
  }

  setBounds(id: MeshId, bounds: MeshBounds) {
    const data = new ArrayBuffer(Meshes.BOUNDS_STRIDE);
    // Quantize bounds to i16 using the scale.
    // minQ = floor(min / scale * INT16_MAX)
    // maxQ = ceil(max / scale * INT16_MAX)
    const minQ = vec3.floor(vec3.mulScalar(vec3.divScalar(bounds.min, bounds.scale), INT16_MAX));
    const maxQ = vec3.ceil(vec3.mulScalar(vec3.divScalar(bounds.max, bounds.scale), INT16_MAX));
    new Int16Array(data, 0, 3).set(minQ);
    new Int16Array(data, 6, 3).set(maxQ);
    new Float32Array(data, 12, 1).set([bounds.scale]);
    this.device.queue.writeBuffer(this.bounds, id * data.byteLength, data);
  }

  async loadGeometry(name: MeshName): Promise<GeometryRef | undefined> {
    const mesh = this.entries.get(name);
    if (mesh === undefined) {
      return undefined;
    }
    if (mesh.geometry) {
      return mesh.geometry;
    }
    const loader = this.loaders.get(name);
    if (loader === undefined) {
      return undefined;
    }
    const geometry = await loader();
    const counts = {
      vertices: geometry.vertices.length,
      lod0: geometry.indices.lod0.length,
      lod1: geometry.indices.lod1?.length ?? 0,
      lod2: geometry.indices.lod2?.length ?? 0,
      lod3: geometry.indices.lod3?.length ?? 0,
    };
    const sizes = {
      vertices: counts.vertices * Meshes.GEOMETRY_VERTEX_STRIDE,
      lod0: counts.lod0 * Meshes.GEOMETRY_INDEX_STRIDE,
      lod1: counts.lod1 * Meshes.GEOMETRY_INDEX_STRIDE,
      lod2: counts.lod2 * Meshes.GEOMETRY_INDEX_STRIDE,
      lod3: counts.lod3 * Meshes.GEOMETRY_INDEX_STRIDE,
    };
    const size = sizes.vertices + sizes.lod0 + sizes.lod1 + sizes.lod2 + sizes.lod3;
    const slot = this.geometry.alloc(size);
    this.setVertices(mesh.id, slot.offset);
    const lod0 = { offset: slot.offset + sizes.vertices, count: counts.lod0 };
    const lod1 = counts.lod1 == 0 ? lod0 : { offset: lod0.offset + sizes.lod0, count: counts.lod1 };
    const lod2 = counts.lod2 == 0 ? lod1 : { offset: lod1.offset + sizes.lod1, count: counts.lod2 };
    const lod3 = counts.lod3 == 0 ? lod2 : { offset: lod2.offset + sizes.lod2, count: counts.lod3 };
    this.setIndices(mesh.id, lod0, lod1, lod2, lod3);
  }
}

export function getBounds(geometry: Geometry): MeshBounds {
  const min = vec3.create();
  const max = vec3.create();
  for (const v of geometry.vertices) {
    vec3.min(min, v.position);
    vec3.max(max, v.position);
  }
  return { min, max, scale: getBoundsScale(min, max) };
}

export function getBoundsScale(min: Vec3Arg, max: Vec3Arg): number {
  return Math.max(
    Math.abs(max[0]!), Math.abs(min[0]!),
    Math.abs(max[1]!), Math.abs(min[1]!),
    Math.abs(max[2]!), Math.abs(min[2]!),
  );
}
