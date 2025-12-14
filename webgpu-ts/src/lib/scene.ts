import type { Asset } from "./assetLibrary";

export type EntityID = string;

export type Entity = {
  asset: Asset;
  transform: Float32Array;
  // TODO: BVH
  entities: Record<EntityID, Entity>;
};

export type Scene = Record<EntityID, Entity>;
