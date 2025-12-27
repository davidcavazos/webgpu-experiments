import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import { Camera, type Content } from "./content";

export type EntityID = string;
export type Entity<a = Content> = {
  content: a;
  matrix: Mat4;
  entities: Record<EntityID, Entity>;
};

export function getPosition(transform: Mat4): Vec3 {
  return vec3.create(
    transform[12], // (0, 3)
    transform[13], // (1, 3)
    transform[14], // (2, 3)
  );
}

export function setPosition(transform: Mat4, pos: Vec3) {
  transform.set(pos, 12);
}
