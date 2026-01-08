import { Empty, type Resource } from "./resource";
import { Transform } from "./transform";

export type EntityID = string;
export type Entity<a = Resource> = {
  resource: a;
  transform: Transform;
  entities: Record<EntityID, Entity>;
};
export const Entity = <a extends Resource>(args?: {
  resource?: a;
  transform?: Transform;
  entities?: Record<EntityID, Entity>;
}): Entity => ({
  resource: args?.resource ?? Empty(),
  transform: args?.transform ?? new Transform(),
  entities: args?.entities ?? {},
});
