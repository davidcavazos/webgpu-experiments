import type { Asset, AssetID } from "./assetLibrary";

export type EntityID = string;

export type Entity = {
  asset: Asset;
  transform: Float32Array;
  // TODO: BVH
  entities: Record<EntityID, Entity>;
};

export function entity(args: {
  asset: Asset;
  transform?: Float32Array;
  entities?: Record<EntityID, Entity>;
}): Entity {
  return {
    asset: args.asset,
    transform: args.transform ?? new Float32Array(4 * 4).fill(0),
    entities: args.entities ?? {},
  };
}

export function ref(args: {
  filename: string;
  transform?: Float32Array;
  entities?: Record<EntityID, Entity>;
}): Entity {
  return entity({
    asset: { tag: "Ref", filename: args.filename },
    transform: args.transform,
    entities: args.entities,
  });
}

export function mesh(args: {
  id?: AssetID;
  vertices: number[][];
  indices: number[];
  transform?: Float32Array;
  entities?: Record<EntityID, Entity>;
}): Entity {
  return entity({
    asset: {
      tag: "Mesh",
      id: args.id,
      vertices: args.vertices,
      indices: args.indices,
    },
    transform: args.transform,
    entities: args.entities,
  });
}

export type Scene = Record<EntityID, Entity>;
