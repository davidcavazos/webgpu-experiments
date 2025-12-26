import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import { Camera, type Content } from "./content";

export type EntityID = string;
export type Entity<a = Content> = {
  content: a;
  transform: Mat4;
  entities: Record<EntityID, Entity>;
};

export function getPosition(transform: Mat4): Vec3 {
  return vec3.create(
    transform[12], // (0, 3)
    transform[13], // (1, 3)
    transform[14], // (2, 3)
  );
}

export function getCameraTarget(camera: Entity<Camera>): Vec3 {
  if (camera.content.target) {
    return camera.content.target;
  }
  return getPosition(
    mat4.translate(camera.transform, [0, 0, camera.content.focusDistance]),
  );
}
