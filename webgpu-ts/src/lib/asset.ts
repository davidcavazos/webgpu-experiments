import type { IndexBufferSlot } from "./assets/indexBuffer";
import type { VertexBufferSlot } from "./assets/vertexBuffer";

export type AssetID = string;
export type AssetLOD = number;
export type RequestID = string;

export type AssetEmpty = {
  tag: "AssetEmpty";
};
export const AssetEmpty = (): Asset => ({ tag: "AssetEmpty" });

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

export type AssetLoading = {
  tag: "AssetLoading";
  id: RequestID;
};
export const AssetLoading = (id: RequestID): Asset => ({
  tag: "AssetLoading",
  id,
});

export type Mesh = {
  tag: "Mesh";
  vertices: VertexBufferSlot;
  indices: IndexBufferSlot;
};
export const Mesh = (args: {
  vertices: VertexBufferSlot;
  indices: IndexBufferSlot;
}): Asset => ({ tag: "Mesh", ...args });

export type Asset = AssetEmpty | AssetLoading | Mesh | AssetError;
