import type { IndexBufferSlot } from "./assets/indexBuffer";
import type { VertexBufferSlot } from "./assets/vertexBuffer";
import { getResourceID, type Resource } from "./resource";

export type AssetID = string;
export type AssetLOD = number;
export type RequestID = string;

export type EmptyAsset = {
  tag: "EmptyAsset";
};
export const EmptyAsset = (): EmptyAsset => ({ tag: "EmptyAsset" });

export type LoadingAsset = {
  tag: "LoadingAsset";
  id: RequestID;
};
export const LoadingAsset = (id: RequestID): LoadingAsset => ({
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
}): MeshAsset => ({ tag: "MeshAsset", ...args });

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
}): AssetError => ({ tag: "AssetError", ...args });

export type Asset = EmptyAsset | LoadingAsset | MeshAsset | AssetError;

export function isLoading(asset: Asset): boolean {
  return asset.tag === "LoadingAsset";
}

export function getAssetID(content: Resource, lod: AssetLOD): AssetID {
  return `${getResourceID(content)}:${lod}`;
}

export function isLowerLOD(id1: AssetID, id2: AssetID): boolean {
  const x = splitAssetID(id1);
  const y = splitAssetID(id2);
  return x.base === y.base && x.lod < y.lod;
}

export function splitAssetID(id: AssetID): { base: string; lod: AssetLOD } {
  const [base, lod] = id.split(":", 2);
  return { base: base ?? "", lod: parseInt(lod ?? "0") };
}
