import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import type { AssetID, AssetLOD } from "./asset";
import { getPosition } from "./entity";

export type ContentLoader = (id: AssetID, lod: AssetLOD) => Promise<Content>;

export type Empty = {
  tag: "Empty";
};
export const Empty = (): Empty => ({ tag: "Empty" });

export type Reference = {
  tag: "Reference";
  filename: string;
};
export const Reference = (filename: string): Reference => ({
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
}): Mesh => ({
  tag: "Mesh",
  id: args?.id,
  vertices: args?.vertices ?? [],
  indices: args?.indices ?? [],
});

export type Camera = {
  tag: "Camera";
  projection: Mat4;
  yaw: number;
  pitch: number;
  roll: number;
  focusDistance: number;
  target?: Vec3;
};
export const Camera = (args?: {
  projection?: Mat4;
  yaw?: number;
  pitch?: number;
  roll?: number;
  focusDistance?: number;
  target?: Vec3;
}): Camera => ({
  tag: "Camera",
  projection: args?.projection ?? mat4.identity(),
  yaw: args?.yaw ?? 0,
  pitch: args?.pitch ?? 0,
  roll: args?.roll ?? 0,
  focusDistance: args?.focusDistance ?? 1,
  target: args?.target,
});

export type Content = Empty | Reference | Mesh | Camera;
