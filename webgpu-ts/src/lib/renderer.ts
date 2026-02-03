import type { Vec2Arg, Vec3Arg } from "wgpu-matrix";
import { GPUHeap, type GPUHeapSlot } from "./gpu/heap";
import { GPUPool } from "./gpu/pool";

export interface Vertex {
  position: Vec3Arg;
  normal: Vec3Arg;
  uv: Vec2Arg;
}
export type Index = number;
export interface Face {
  indices: Index[];
}
export interface GeometrySlots {
  vertices: GPUHeapSlot;
  indices: [GPUHeapSlot, GPUHeapSlot, GPUHeapSlot, GPUHeapSlot];
}

export type MeshId = number;
export type MeshName = string;

export class Geometry {
  device: GPUDevice;
  slots: Map<MeshName, GeometrySlots>;
  heap: GPUHeap;
  constructor(device: GPUDevice, args?: {
    size?: number;
  }) {
    this.device = device;
    this.slots = new Map();
    this.heap = new GPUHeap(this.device, {
      buffer: this.device.createBuffer({
        label: 'geometry',
        size: args?.size ?? Math.min(this.device.limits.maxBufferSize, mb(512)),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      }),
    });
    const size_mb = this.heap.buffer.size / 1024 / 1024;
    console.log(`Reserved geometry: ${size_mb} MB (vertex/index heap)`);
  }
}

export class Meshes {
  static readonly VERTICES_BLOCK_SIZE = 4;
  static readonly INDICES_BLOCK_SIZE = 32;
  static readonly BOUNDS_BLOCK_SIZE = 16;
  device: GPUDevice;
  vertices: GPUPool;
  indices: GPUPool;
  bounds: GPUPool;
  constructor(device: GPUDevice, args: {
    capacity?: number;
  }) {
    const maxCapacity = 0xFFFF;
    args.capacity ??= maxCapacity;
    if (args.capacity > maxCapacity) {
      throw new Error(`Meshes are u16-indexed, capacity cannot exceed ${maxCapacity}, got ${args.capacity}`);
    }
    this.device = device;
    this.vertices = new GPUPool(this.device, {
      blockSize: Meshes.VERTICES_BLOCK_SIZE,
      buffer: this.device.createBuffer({
        label: 'meshes_vertices',
        size: args.capacity * Meshes.VERTICES_BLOCK_SIZE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    this.indices = new GPUPool(this.device, {
      blockSize: Meshes.INDICES_BLOCK_SIZE,
      buffer: this.device.createBuffer({
        label: 'meshes_indices',
        size: args.capacity * Meshes.INDICES_BLOCK_SIZE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    this.bounds = new GPUPool(this.device, {
      blockSize: Meshes.BOUNDS_BLOCK_SIZE,
      buffer: this.device.createBuffer({
        label: 'meshes_bounds',
        size: args.capacity * Meshes.BOUNDS_BLOCK_SIZE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    });
    const reserved_mb = this.reserved() / 1024 / 1024;
    console.log(`Reserved meshes: ${reserved_mb.toFixed(2)} MB (${args.capacity} pool)`);
  };

  reserved(): number {
    return this.vertices.buffer.size + this.indices.buffer.size + this.bounds.buffer.size;
  }
}

export class Renderer {
  device: GPUDevice;
  geometry: Geometry;
  meshes: Meshes;
  constructor(device: GPUDevice, args?: {
    geometryHeapSize?: number,
    meshesPoolCapacity?: number,
  }) {
    this.device = device;
    this.geometry = new Geometry(this.device, {
      size: args?.geometryHeapSize,
    });
    this.meshes = new Meshes(this.device, {
      capacity: args?.meshesPoolCapacity,
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
