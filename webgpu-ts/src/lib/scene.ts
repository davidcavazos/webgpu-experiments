import { mat4, vec3 } from "wgpu-matrix";
import { Camera } from "./content";
import type { Entity, EntityID } from "./entity";

export class Scene {
  entities: Record<EntityID, Entity>;
  defaultCamera: Entity<Camera>;
  constructor(entities?: Record<EntityID, Entity>) {
    this.entities = entities ?? {};

    // const eye = [1, 2, 5];
    const eye = vec3.create(0, 0, 10);
    const target = vec3.create(0, 0, 0);
    const up = vec3.create(0, 1, 0);
    this.defaultCamera = {
      content: Camera(),
      matrix: mat4.lookAt(eye, target, up),
      entities: {},
    };
  }

  find(path: EntityID[]): Entity | undefined {
    return $find(path, this.entities);
  }

  findCamera(path: EntityID[]): { camera: Entity<Camera>; found: boolean } {
    const entity = this.find(path);
    if (entity?.content.tag === "Camera") {
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
