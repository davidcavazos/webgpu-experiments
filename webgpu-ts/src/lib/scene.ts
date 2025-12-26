import { mat4, type Mat4 } from "wgpu-matrix";
import type { AssetDescriptor, AssetID } from "./asset";

export type EntityID = string;

export type Entity = {
  asset: AssetDescriptor;
  transform: Mat4;
  entities: Record<EntityID, Entity>;
};

export class Scene {
  entities: Record<EntityID, Entity>;
  constructor(entities?: Record<EntityID, Entity>) {
    this.entities = entities ?? {};
  }

  find(path: EntityID[]): Entity | undefined {
    return $find(path, this.entities);
  }
}

function $find(
  path: EntityID[],
  entities: Record<EntityID, Entity>,
): Entity | undefined {
  const [head, ...tail] = path;
  if (head === undefined) {
    return undefined;
  }
  if (tail.length === 0) {
    return entities[head];
  }
  return $find(tail, entities[head]?.entities ?? {});
}
