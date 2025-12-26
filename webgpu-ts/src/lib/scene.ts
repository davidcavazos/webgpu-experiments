import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import type { AssetDescriptor, AssetID } from "./asset";

export type EntityID = string;

export type Entity = {
  asset: AssetDescriptor;
  transform: Mat4;
  entities: Record<EntityID, Entity>;
};

export function getPosition(entity: Entity): Vec3 {
  const x = entity.transform[12]; // (0, 3)
  const y = entity.transform[13]; // (1, 3)
  const z = entity.transform[14]; // (2, 3)
  return vec3.create(x, y, z);
}

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
