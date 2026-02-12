import type { QuatArg, Vec2Arg, Vec3Arg, Vec4Arg } from "wgpu-matrix";
import type { EntityId } from "./entities";
import type { MeshId } from "./meshes";

export type Transform = {
  position?: Vec3Arg;
  rotation?: QuatArg;
  scale?: number;
};

export type EntityName = string;
export interface Entity {
  name: EntityName;
  parentId?: EntityId;
  transform?: Transform;
  mesh?: MeshName;
  material?: MaterialName;
  camera?: EntityId;
  light?: EntityId;
  children?: Record<EntityName, Entity>;
  opaque?: boolean;
}

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

export type MeshName = string;
export interface Mesh {
  loader: () => Promise<Geometry>;
  bounds: {
    min: Vec3Arg;
    max: Vec3Arg;
  };
}
export type MaterialName = string;
export interface Material {
  opaque?: boolean;
}

export interface Scene {
  entities: Record<EntityName, Entity>;
  meshes: Record<MeshName, Mesh>;
  materials: Record<MaterialName, Material>;
}

export function findEntity(entities: Record<EntityName, Entity>, name: EntityName): Entity | undefined {
  for (const entity of Object.values(entities)) {
    if (entity.name === name) {
      return entity;
    }
    const child = findEntity(entity.children ?? {}, name);
    if (child !== undefined) {
      return child;
    }
  }
  return undefined;
}