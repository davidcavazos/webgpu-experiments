import { vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import type { AssetID, AssetLOD } from "./asset";

export type ContentLoader = (
  id: AssetID,
  lod: AssetLOD,
) => Promise<EntityContent>;

export type EntityID = string;

export type EntityEmpty = {
  tag: "EntityEmpty";
};
export const EntityEmpty = (): EntityContent => ({ tag: "EntityEmpty" });

export type EntityReference = {
  tag: "EntityReference";
  filename: string;
};
export const EntityReference = (filename: string): EntityContent => ({
  tag: "EntityReference",
  filename,
});

export type EntityMesh = {
  tag: "EntityMesh";
  id?: AssetID;
  // TODO: lods: {AssetLOD: {vertices, indices}}
  vertices: number[][];
  indices: number[]; // TODO: faces: number[][]
};
export const EntityMesh = (args?: {
  id?: AssetID;
  vertices?: number[][];
  indices?: number[];
}): EntityContent => ({
  tag: "EntityMesh",
  id: args?.id,
  vertices: args?.vertices ?? [],
  indices: args?.indices ?? [],
});

export type EntityContent = EntityEmpty | EntityReference | EntityMesh;

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
