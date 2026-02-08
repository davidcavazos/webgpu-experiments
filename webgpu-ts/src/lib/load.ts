import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Renderer } from "./renderer";
import { Transform } from "./transform";
import type { Entity, EntityId, EntityName } from "./entities";
import type { Mesh, Vertex } from "./meshes";

export async function load(
  renderer: Renderer,
  url: string,
): Promise<[string, Entity]> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return loadNode(renderer, gltf.scene);
}

function loadNode(renderer: Renderer, node: THREE.Object3D, parentId?: EntityId): [string, Entity] {
  const name = node.name;
  const id = renderer.entities.add(name);
  const entity: Entity = {};
  if (parentId !== undefined) {
    entity.parentId = parentId;
  }
  entity.transform = new Transform({
    position: [node.position.x, node.position.y, node.position.z],
    rotation: [
      node.quaternion.x,
      node.quaternion.y,
      node.quaternion.z,
      node.quaternion.w,
    ],
    scale: (node.scale.x + node.scale.y + node.scale.z) / 3.0,
  });
  // TODO(optimization): If there's only one child, flatten it directly.
  // * Can only do this if there's no overlap in mesh/material/light.
  const children = node.children.map((child) => loadNode(renderer, child, id));
  if (children.length > 0) {
    entity.children = Object.fromEntries(children);
  }
  renderer.entities.setEntity(id, entity);

  if (node.type === 'Mesh') {
    const threeMesh = node as THREE.Mesh;

    // Add mesh.
    const position = threeMesh.geometry.getAttribute('position');
    const normal = threeMesh.geometry.getAttribute('normal');
    const uv = threeMesh.geometry.getAttribute('uv');
    const index = threeMesh.geometry.index;
    const mesh: Mesh = {
      loader: () => ({
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

    const meshName = threeMesh.geometry.uuid;
    renderer.meshes.add(meshName, mesh);

    // TODO: Remove this, it should be loaded via cpu_feedback.
    renderer.meshes.loadGeometry(meshName);

    // if (Array.isArray(threeMesh.material)) {
    //   throw new Error('TODO: support material arrays in load');
    // } else {
    //   throw new Error('TODO: support material in load');
    // }
    entity.opaque = true;
  }
  return [name, entity];
}

// export interface Entity {
//   transform?: Transform;
//   meshId?: MeshId;
//   materialId?: MaterialId;
//   light?: undefined; // TODO
//   children?: [EntityId, Entity][];
