import type { IndexBufferSlot } from "./assets/indexBuffer";
import type { VertexBufferSlot } from "./assets/vertexBuffer";

export type AssetID = string;
export type AssetLOD = number;
export type RequestID = string;
export type AssetLoader = (
  id: AssetID,
  lod: AssetLOD,
) => Promise<AssetDescriptor>;

export type AssetError = {
  tag: "AssetError";
  id: AssetID;
  lod: AssetLOD;
  reason: string;
};

export type AssetReference = {
  tag: "AssetReference";
  filename: string;
};
export type MeshDescriptor = {
  tag: "MeshDescriptor";
  id?: AssetID;
  // TODO: lods: {AssetLOD: {vertices, indices}}
  vertices: number[][];
  indices: number[]; // TODO: faces: number[][]
};
export type AssetDescriptor = AssetReference | MeshDescriptor | AssetError;

export type AssetLoading = {
  tag: "AssetLoading";
  id: RequestID;
};
export type Mesh = {
  tag: "Mesh";
  vertices: VertexBufferSlot;
  indices: IndexBufferSlot;
};
export type Asset = AssetLoading | Mesh | AssetError;
