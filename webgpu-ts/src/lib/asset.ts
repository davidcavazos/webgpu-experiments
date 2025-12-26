import type { IndexBufferSlot } from "./assets/indexBuffer";
import type { VertexBufferSlot } from "./assets/vertexBuffer";

export type AssetID = string;
export type AssetLOD = number;
export type RequestID = string;

export type EmptyAsset = {
  tag: "EmptyAsset";
};
export const EmptyAsset = (): Asset => ({ tag: "EmptyAsset" });

export type LoadingAsset = {
  tag: "LoadingAsset";
  id: RequestID;
};
export const LoadingAsset = (id: RequestID): Asset => ({
  tag: "LoadingAsset",
  id,
});

export type MeshAsset = {
  tag: "MeshAsset";
  vertices: VertexBufferSlot;
  indices: IndexBufferSlot;
};
export const MeshAsset = (args: {
  vertices: VertexBufferSlot;
  indices: IndexBufferSlot;
}): Asset => ({ tag: "MeshAsset", ...args });

export type AssetError = {
  tag: "AssetError";
  id: AssetID;
  lod: AssetLOD;
  reason: string;
};
export const AssetError = (args: {
  id: AssetID;
  lod: AssetLOD;
  reason: string;
}): Asset => ({ tag: "AssetError", ...args });

export type Asset = EmptyAsset | LoadingAsset | MeshAsset | AssetError;

export function isLoading(asset: Asset): boolean {
  return asset.tag === "LoadingAsset";
}
