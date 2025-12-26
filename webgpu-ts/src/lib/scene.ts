import type { Camera } from "./content";
import type { Entity, EntityID } from "./entity";

export class Scene {
  entities: Record<EntityID, Entity>;
  constructor(entities?: Record<EntityID, Entity>) {
    this.entities = entities ?? {};
  }

  find(path: EntityID[]): Entity | undefined {
    return $find(path, this.entities);
  }

  findCamera(path: EntityID[]): Entity<Camera> | undefined {
    const entity = this.find(path);
    if (entity?.content.tag === "Camera") {
      return entity as Entity<Camera>;
    }
    return undefined;
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
