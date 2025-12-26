import { vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import type { AssetID, AssetLOD } from "./asset";

export type EntityID = string;
export type ContentLoader = (
  id: AssetID,
  lod: AssetLOD,
) => Promise<EntityContent>;

export type Empty = {
  tag: "Empty";
};
export const Empty = (): EntityContent => ({ tag: "Empty" });

export type Reference = {
  tag: "Reference";
  filename: string;
};
export const Reference = (filename: string): EntityContent => ({
  tag: "Reference",
  filename,
});

export type Mesh = {
  tag: "Mesh";
  id?: AssetID;
  // TODO: lods: {AssetLOD: {vertices, indices}}
  vertices: number[][];
  indices: number[]; // TODO: faces: number[][]
};
export const Mesh = (args?: {
  id?: AssetID;
  vertices?: number[][];
  indices?: number[];
}): EntityContent => ({
  tag: "Mesh",
  id: args?.id,
  vertices: args?.vertices ?? [],
  indices: args?.indices ?? [],
});

export type EntityCamera = {
  projection: Mat4;
  target: Vec3;
  up: Vec3;
};

export type EntityContent = Empty | Reference | Mesh;

export type Entity = {
  content: EntityContent;
  transform: Mat4;
  entities: Record<EntityID, Entity>;
};

export function getPosition(entity: Entity): Vec3 {
  const x = entity.transform[12]; // (0, 3)
  const y = entity.transform[13]; // (1, 3)
  const z = entity.transform[14]; // (2, 3)
  return vec3.create(x, y, z);
}
