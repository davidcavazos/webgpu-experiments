import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Entity, Mesh, Renderer, Vertex } from "./renderer";
import { Transform } from "./transform";

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
    entity.children = Object.fromEntries(children);
  }
  if (node.type === 'Mesh') {
    const threeMesh = node as THREE.Mesh;

    // Add mesh.
    const position = threeMesh.geometry.getAttribute('position');
    const normal = threeMesh.geometry.getAttribute('normal');
    const uv = threeMesh.geometry.getAttribute('uv');
    const index = threeMesh.geometry.index;
    const mesh: Mesh = {
      geometry: () => ({
        vertices: Array.from({ length: position.count }, (_, i): Vertex => ({
          position: [position.getX(i), position.getY(i), position.getZ(i)],
          normal: [normal.getX(i), normal.getY(i), normal.getZ(i)],
          uv: [uv.getX(i), uv.getY(i)],
        })),
        indices: {
          lod0: [...index?.array ?? []],
        }
      })
    };
    if (threeMesh.geometry.boundingBox !== null) {
      const min = threeMesh.geometry.boundingBox.min;
      const max = threeMesh.geometry.boundingBox.max;
      mesh.bounds = {
        min: [min.x, min.y, min.z],
        max: [max.x, max.y, max.z],
      };
    }
    renderer.meshes.add(threeMesh.geometry.uuid, mesh);

    // Add entity.
    entity.meshId = threeMesh.geometry.uuid;
    if (Array.isArray(threeMesh.material)) {
      throw new Error('TODO: support material arrays in load');
    } else {
      entity.materialId = threeMesh.material.name;
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
