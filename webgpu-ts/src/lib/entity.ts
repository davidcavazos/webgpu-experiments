import { Empty, type Content } from "./content";
import { Transform } from "./transform";

export type EntityID = string;
export type Entity<a = Content> = {
  content: a;
  transform: Transform;
  entities: Record<EntityID, Entity>;
};
export const Entity = <a extends Content>(args?: {
  content?: a;
  transform?: Transform;
  entities?: Record<EntityID, Entity>;
}): Entity => ({
  content: args?.content ?? Empty(),
  transform: args?.transform ?? new Transform(),
  entities: args?.entities ?? {},
});
