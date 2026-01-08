import { mat4, vec3 } from "wgpu-matrix";
import { Camera } from "./resource";
import type { Entity, EntityID } from "./entity";
import { Transform } from "./transform";

export class Scene {
  entities: Record<EntityID, Entity>;
  defaultCamera: Entity<Camera>;
  constructor(entities?: Record<EntityID, Entity>) {
    this.entities = entities ?? {};

    this.defaultCamera = {
      resource: Camera(),
      transform: new Transform({ position: [1, 2, 5] }).lookAt([0, 0, 0]),
      entities: {},
    };
  }

  find(path: EntityID[]): Entity | undefined {
    return $find(path, this.entities);
  }

  findCamera(path: EntityID[]): { camera: Entity<Camera>; found: boolean } {
    const entity = this.find(path);
    if (entity?.resource.tag === "Camera") {
      return { camera: entity as Entity<Camera>, found: true };
    }
    return { camera: this.defaultCamera, found: false };
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
