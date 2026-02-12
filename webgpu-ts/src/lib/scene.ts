import type { Entity, EntityName } from "./entities";
import type { Mesh, MeshName } from "./meshes";
import type { Material, MaterialName } from "./materials";

export interface Scene {
  entities: Record<EntityName, Entity>;
  meshes: Record<MeshName, Mesh>;
  materials: Record<MaterialName, Material>;
}

export function findEntity(entities: Record<EntityName, Entity>, name: EntityName): Entity | undefined {
  for (const entity of Object.values(entities)) {
    if (entity.name === name) {
      return entity;
    }
    const child = findEntity(entity.children ?? {}, name);
    if (child !== undefined) {
      return child;
    }
  }
  return undefined;
}