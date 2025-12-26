import { vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import type { AssetDescriptor } from "./asset";

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
