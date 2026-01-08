import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import type { AssetID, AssetLOD } from "./asset";
import { hashRecord } from "./stdlib";

export type ResourceID = string;
export type ResourceLoader = (id: AssetID, lod: AssetLOD) => Promise<Resource>;

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
  vertices: number[][];
  indices: number[]; // TODO: faces: number[][]
  boundingRadius: number;
};
export const Mesh = (args?: {
  id?: AssetID;
  vertices?: number[][];
  indices?: number[];
  boundingRadius?: number;
}): Mesh => ({
  tag: "Mesh",
  id: args?.id,
  vertices: args?.vertices ?? [],
  indices: args?.indices ?? [],
  boundingRadius:
    args?.boundingRadius ?? findBoundingRadius(args?.vertices ?? []),
});

export function findBoundingRadius(vertices: number[][]): number {
  let radius = 0;
  for (const [x, y, z] of vertices) {
    const point = vec3.create(x ?? 0, y ?? 0, z ?? 0);
    radius = Math.max(radius, vec3.len(point));
  }
  return radius;
}

export type Camera = {
  tag: "Camera";
  projection: Mat4;
};
export const Camera = (args?: { projection?: Mat4 }): Camera => ({
  tag: "Camera",
  projection: args?.projection ?? mat4.identity(),
});

export type ResourceError = {
  tag: "ResourceError";
  id: AssetID;
  lod: AssetLOD;
  reason: string;
};
export const ResourceError = (args: {
  id: AssetID;
  lod: AssetLOD;
  reason: string;
}): ResourceError => ({
  tag: "ResourceError",
  id: args.id,
  lod: args.lod,
  reason: args.reason,
});

export type Resource = Empty | Reference | Mesh | Camera | ResourceError;

export function getResourceID(content: Resource): ResourceID {
  switch (content.tag) {
    case "Empty":
      return "<Empty>";
    case "Reference":
      return content.filename;
    case "Mesh":
      if (content.id !== undefined) {
        return content.id;
      }
      return `Mesh<${hashRecord(content)}>`;
    case "Camera":
      return `Camera<${hashRecord(content)}>`;
    // case "AssetError":
    //   return `AssetError<${content.id}:${content.lod}>`;
    // case "CameraDescriptor": {
    //   const hash = JSON.stringify([...asset.projection]);
    //   return `Camera<${hash}>`;
    // }
    default:
      throw new Error(
        `engine.getAssetIDBase: not implemented ${(content as Resource).tag}`,
      );
  }
}
