import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Entity, Material, Renderer, Vertex } from "./renderer";
import { Transform } from "./transform";
import { vec3 } from "wgpu-matrix";
import type { Face } from "three/examples/jsm/Addons.js";

export async function load(
  renderer: Renderer,
  url: string,
): Promise<[string, Entity]> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return loadNode(renderer, gltf.scene);
}

function loadNode(renderer: Renderer, node: THREE.Object3D): [string, Entity] {
  const transform = new Transform({
    position: [node.position.x, node.position.y, node.position.z],
    rotation: [
      node.quaternion.x,
      node.quaternion.y,
      node.quaternion.z,
      node.quaternion.w,
    ],
    scale: (node.scale.x + node.scale.y + node.scale.z) / 3.0,
  });
  const entity: Entity = { transform };
  // TODO(optimization): If there's only one child, flatten it directly.
  // * Can only do this if there's no overlap in mesh/material/light.
  const children = node.children.map((child) => loadNode(renderer, child));
  if (children.length > 0) {
    entity.children = children;
  }
  if (node.type === 'Mesh') {
    const mesh = node as THREE.Mesh;
    entity.meshId = mesh.geometry.uuid;
    if (Array.isArray(mesh.material)) {
      throw new Error('TODO: support material arrays in load');
    } else {
      entity.materialId = mesh.material.name;
    }
    // console.log(node.name, node.type, entity, '\n', mesh.geometry, '\n', mesh.material);
  }
  return [node.name, entity];
}

// export interface Entity {
//   transform?: Transform;
//   meshId?: MeshId;
//   materialId?: MaterialId;
//   light?: undefined; // TODO
//   children?: [EntityId, Entity][];
