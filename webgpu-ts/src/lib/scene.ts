import type { AssetDescriptor, AssetID } from "./asset";
import { mat4 } from "./mat4";
import { Just, None, type Maybe } from "./stdlib";
import { Transform } from "./transform";

export type EntityID = string;

export type Entity = {
  asset: AssetDescriptor;
  transform: Transform;
  entities: Record<EntityID, Entity>;
};

export function entity(args: {
  asset: AssetDescriptor;
  transform?: Transform;
  entities?: Record<EntityID, Entity>;
}): Entity {
  return {
    asset: args.asset,
    transform: args.transform ?? new Transform(),
    entities: args.entities ?? {},
  };
}

export function ref(args: {
  filename: string;
  transform?: Transform;
  entities?: Record<EntityID, Entity>;
}): Entity {
  return entity({
    asset: { tag: "AssetReference", filename: args.filename },
    transform: args.transform,
    entities: args.entities,
  });
}

export function mesh(args?: {
  id?: AssetID;
  vertices?: number[][];
  indices?: number[];
  transform?: Transform;
  entities?: Record<EntityID, Entity>;
}): Entity {
  return entity({
    asset: {
      tag: "MeshDescriptor",
      id: args?.id,
      vertices: args?.vertices ?? [],
      indices: args?.indices ?? [],
    },
    transform: args?.transform,
    entities: args?.entities,
  });
}

// export function camera(args: {
//   projection: Float32Array;
//   transform?: Float32Array;
//   entities?: Record<EntityID, Entity>;
// }) {
//   return entity({
//     asset: {
//       tag: "CameraDescriptor",
//       projection: args?.projection,
//     },
//     transform: args.transform,
//     entities: args.entities,
//   });
// }

export function camera(args?: {
  transform?: Transform;
  entities?: Record<EntityID, Entity>;
}) {
  return entity({
    asset: { tag: "Node" },
    transform: args?.transform,
    entities: args?.entities,
  });
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
