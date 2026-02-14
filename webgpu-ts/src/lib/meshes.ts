import { vec3, type Vec2Arg, type Vec3, type Vec3Arg } from "wgpu-matrix";
import { mb, UINT16_MAX } from "./stdlib";
import { GPUHeap } from "./gpu/heap";
import { GPUPool } from "./gpu/pool";

const DEBUG = {
  WRITE_BUFFER: {
    ALL: false,
    VERTICES: false,
    LODS: false,
    BOUNDS: false,
    GEOMETRY: false,
  },
};

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
};
export interface GeometryRef {
  baseVertex: number;
  lod0: { firstIndex: number, indexCount: number; },
  lod1: { firstIndex: number, indexCount: number; },
  lod2: { firstIndex: number, indexCount: number; },
  lod3: { firstIndex: number, indexCount: number; },
}

export type MeshId = number;
export type MeshName = string;
export interface Mesh {
  loader: () => Promise<Geometry>;
  bounds: {
    min: Vec3Arg;
    max: Vec3Arg;
  };
}
export interface MeshBounds {
  min: Vec3;
  max: Vec3;
  scale: number;
}
export interface MeshRef {
  id: MeshId;
  name: MeshName;
  geometry: GeometryRef | undefined;
  bounds: MeshBounds;
}

export class Meshes {
  static readonly MAX_CAPACITY = UINT16_MAX;

  static readonly BASE_VERTEX = { size: 4 }; // u32

  // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001004d01000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c7df5a77636059cbd59ca89d90298a2affa7bbb460db73fa63d127887492c476bab67adb081c499e0c7046f903582183cf8e7ee1ff95b36d085887fc6d1033f3ec46a18aa67fc6eba83dc31bd7846a04ee2f6ac6351705ec665fa1ccb7ccdc26daa727b5a0ccba882301f795528dfee2236c88275939f0139633a9e2d3774070c4361b7e1d4f2a61dfff148bcbc
  static readonly LODS = {
    size: 32,
    view: (data: ArrayBuffer) => ({
      lod0: {
        firstIndex: new Uint32Array(data, 0, 1),
        indexCount: new Uint32Array(data, 4, 1),
      },
      lod1: {
        firstIndex: new Uint32Array(data, 8, 1),
        indexCount: new Uint32Array(data, 12, 1),
      },
      lod2: {
        firstIndex: new Uint32Array(data, 16, 1),
        indexCount: new Uint32Array(data, 20, 1),
      },
      lod3: {
        firstIndex: new Uint32Array(data, 24, 1),
        indexCount: new Uint32Array(data, 28, 1),
      },
    }),
  };

  // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d00000100d000000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6c35c7a3a1cbc4075a9de2f64eed23c38f74bcd087f2fd447185f21e3b9f3e6cf38930abc114ae8e1352e1cf62d16adf6b59aa46b8e65bf8d8be12e1fe0c64302987163da012947df65c503899810408370d765930d973bf24c6f90743ab68a3c40b962cca6f889b9e9f22894aed5ba6afb7f1a2d0ffff6ccc0000
  static readonly BOUNDS = {
    size: 32,
    view: (data: ArrayBuffer) => ({
      min: new Float32Array(data, 0, 3),
      scale: new Float32Array(data, 12, 1),
      max: new Float32Array(data, 16, 3),
    }),
  };

  // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001000a01000000000000003d888b0237284d03d2258bce8be1af0081f03468f71776d4f392dc8bbd6cd12bb77ae4df8a541430a62ceaa7a28e236f1ecf27ebbf8baf2dd0c87683f1d45382f492f7500ab40c37e99189de5f8fe963927340abfab3fea597fad52ec74c368723453ef9d30836947c5209e7ce1a9aaadc03120146d64a47c2f2f2ea6b578b302df1b6361dfd53388c2551c8b4e826d59d166017ae06c9e339f2ae3f598c9e81da7cba7edac13d280f5fff0f011a00
  static readonly GEOMETRY_VERTEX = {
    size: 32,
    view: (data: ArrayBuffer, i: number) => {
      const offset = i * Meshes.GEOMETRY_VERTEX.size;
      return {
        position: new Float32Array(data, 0 + offset, 3),
        normal: new Float16Array(data, 16 + offset, 3),
        uv: new Float16Array(data, 24 + offset, 2),
      };
    },
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, //  position
      { shaderLocation: 1, offset: 16, format: 'float16x4' }, // normal
      { shaderLocation: 2, offset: 24, format: 'float16x2' }, // uv
    ] as GPUVertexAttribute[],
  };

  static readonly GEOMETRY_INDEX = {
    size: 4, // u32
    format: 'uint32' as GPUIndexFormat,
  };

  device: GPUDevice;
  capacity: number;
  entries: Map<MeshName, MeshRef>;
  loaders: Map<MeshName, () => Promise<Geometry>>;
  geometry: GPUHeap;
  base_vertex: GPUPool;
  lods: GPUBuffer;
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
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      }),
    });
    this.base_vertex = new GPUPool(this.device, {
      blockSize: Meshes.BASE_VERTEX.size,
      buffer: this.device.createBuffer({
        label: 'meshes_vertices',
        size: this.capacity * Meshes.BASE_VERTEX.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    this.lods = this.device.createBuffer({
      label: 'meshes_indices',
      size: this.capacity * Meshes.LODS.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.bounds = this.device.createBuffer({
      label: 'meshes_bounds',
      size: this.capacity * Meshes.BOUNDS.size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  };

  clear() {
    this.entries.clear();
    this.loaders.clear();
    this.geometry.clear();
    this.base_vertex.clear();
  }

  get(name: MeshName): MeshRef | undefined {
    return this.entries.get(name);
  }

  add(name: MeshName, mesh: Mesh): MeshRef {
    const ref: MeshRef = {
      id: this.entries.get(name)?.id ?? this.base_vertex.allocate(),
      name,
      geometry: undefined,
      bounds: {
        min: vec3.copy(mesh.bounds.min),
        max: vec3.copy(mesh.bounds.max),
        scale: getBoundsScale(mesh.bounds.min, mesh.bounds.max),
      },
    };
    this.entries.set(name, ref);
    this.loaders.set(name, mesh.loader);
    return ref;
  }

  writeLODs(
    id: MeshId,
    ref: GeometryRef,
  ) {
    const data = new ArrayBuffer(Meshes.LODS.size);
    new Uint32Array(data, 0, 8).set([
      ref.lod0.firstIndex, ref.lod0.indexCount,
      ref.lod1.firstIndex, ref.lod1.indexCount,
      ref.lod2.firstIndex, ref.lod2.indexCount,
      ref.lod3.firstIndex, ref.lod3.indexCount,
    ]);
    if (DEBUG.WRITE_BUFFER.ALL || DEBUG.WRITE_BUFFER.LODS) {
      console.log('lods', id, ref, data);
    }
    this.device.queue.writeBuffer(this.lods, id * data.byteLength, data);
  }

  writeBounds(id: MeshId, bounds: MeshBounds) {
    const data = new ArrayBuffer(Meshes.BOUNDS.size);
    const view = Meshes.BOUNDS.view(data);
    view.min.set(bounds.min);
    view.max.set(bounds.max);
    view.scale.set([bounds.scale]);
    if (DEBUG.WRITE_BUFFER.ALL || DEBUG.WRITE_BUFFER.BOUNDS) {
      console.log('bounds', id, bounds, view);
    }
    this.device.queue.writeBuffer(this.bounds, id * data.byteLength, data);
  }

  writeGeometry(geometry: Geometry): GeometryRef {
    const counts = {
      vertices: geometry.vertices.length,
      lod0: geometry.indices.lod0.length,
      lod1: geometry.indices.lod1?.length ?? 0,
      lod2: geometry.indices.lod2?.length ?? 0,
      lod3: geometry.indices.lod3?.length ?? 0,
    };

    const sizes = {
      vertices: counts.vertices * Meshes.GEOMETRY_VERTEX.size,
      lod0: counts.lod0 * Meshes.GEOMETRY_INDEX.size,
      lod1: counts.lod1 * Meshes.GEOMETRY_INDEX.size,
      lod2: counts.lod2 * Meshes.GEOMETRY_INDEX.size,
      lod3: counts.lod3 * Meshes.GEOMETRY_INDEX.size,
    };

    const size = sizes.vertices + sizes.lod0 + sizes.lod1 + sizes.lod2 + sizes.lod3;
    const alginMask = Meshes.GEOMETRY_VERTEX.size - 1;
    const alignedSize = (size + alginMask) & ~alginMask;
    const slot = this.geometry.alloc(alignedSize);

    const vertexData = new ArrayBuffer(sizes.vertices);
    for (const [i, v] of geometry.vertices.entries()) {
      const view = Meshes.GEOMETRY_VERTEX.view(vertexData, i);
      view.position.set(v.position);
      view.normal.set(v.normal);
      view.uv.set(v.uv);
    }
    this.geometry.write(slot.offset, vertexData);

    const lod0 = { offset: slot.offset + sizes.vertices, count: counts.lod0 };
    const lod1 = counts.lod1 === 0 ? lod0 : { offset: lod0.offset + sizes.lod0, count: counts.lod1 };
    const lod2 = counts.lod2 === 0 ? lod1 : { offset: lod1.offset + sizes.lod1, count: counts.lod2 };
    const lod3 = counts.lod3 === 0 ? lod2 : { offset: lod2.offset + sizes.lod2, count: counts.lod3 };

    const indexData = new Uint32Array(geometry.indices.lod0);
    this.geometry.write(lod0.offset, indexData.buffer);
    if (geometry.indices.lod1 && counts.lod1 > 0) {
      const indexData = new Uint32Array(geometry.indices.lod1);
      this.geometry.write(lod1.offset, indexData.buffer);
    }
    if (geometry.indices.lod2 && counts.lod2 > 0) {
      const indexData = new Uint32Array(geometry.indices.lod2);
      this.geometry.write(lod2.offset, indexData.buffer);
    }
    if (geometry.indices.lod3 && counts.lod3 > 0) {
      const indexData = new Uint32Array(geometry.indices.lod3);
      this.geometry.write(lod3.offset, indexData.buffer);
    }

    return {
      baseVertex: slot.offset / Meshes.GEOMETRY_VERTEX.size,
      lod0: { firstIndex: lod0.offset / Meshes.GEOMETRY_INDEX.size, indexCount: lod0.count },
      lod1: { firstIndex: lod1.offset / Meshes.GEOMETRY_INDEX.size, indexCount: lod1.count },
      lod2: { firstIndex: lod2.offset / Meshes.GEOMETRY_INDEX.size, indexCount: lod2.count },
      lod3: { firstIndex: lod3.offset / Meshes.GEOMETRY_INDEX.size, indexCount: lod3.count },
    };
  }

  writeBaseVertex(id: MeshId, offset: number) {
    this.base_vertex.write(id, new Uint32Array([offset]));
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
    const ref = this.writeGeometry(geometry);
    this.entries.set(name, { ...mesh, geometry: ref });
    this.writeLODs(mesh.id, ref);
    this.writeBaseVertex(mesh.id, ref.baseVertex);
    return ref;
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
