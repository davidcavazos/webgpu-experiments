import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import type { AssetID, AssetLOD } from "./asset";

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
};
export const Camera = (args?: { projection?: Mat4 }): Camera => ({
  tag: "Camera",
  projection: args?.projection ?? mat4.identity(),
});

export type ContentError = {
  tag: "ContentError";
  id: AssetID;
  lod: AssetLOD;
  reason: string;
};
export const ContentError = (args: {
  id: AssetID;
  lod: AssetLOD;
  reason: string;
}): ContentError => ({
  tag: "ContentError",
  id: args.id,
  lod: args.lod,
  reason: args.reason,
});

export type Content = Empty | Reference | Mesh | Camera | ContentError;
