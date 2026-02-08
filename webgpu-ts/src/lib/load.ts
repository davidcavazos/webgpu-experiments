import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Renderer } from "./renderer";
import { Transform } from "./transform";
import type { Entity, EntityId, EntityName } from "./entities";
import type { Mesh, MeshName, Vertex } from "./meshes";

export async function load(
  renderer: Renderer,
  url: string,
): Promise<[string, Entity]> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return loadEntity(renderer, gltf.scene);
}

function loadEntity(renderer: Renderer, node: THREE.Object3D, parentId?: EntityId): [EntityName, Entity] {
  const name = node.name;
  const entityId = renderer.entities.add(name);
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
  const children = node.children.map((child) => loadEntity(renderer, child, entityId));
  if (children.length > 0) {
    entity.children = Object.fromEntries(children);
  }
  renderer.entities.setEntity(entityId, entity);

  if (node.type === 'Mesh') {
    const [meshName, mesh] = getMesh(node as THREE.Mesh);
    const { id: meshId } = renderer.meshes.add(meshName, mesh);
    // TODO: Remove this, it should be loaded via cpu_feedback.
    renderer.meshes.loadGeometry(meshName);
    renderer.entities.setMesh(entityId, { meshId });

    // if (Array.isArray(node.material)) {
    //   throw new Error('TODO: support material arrays in load');
    // } else {
    //   throw new Error('TODO: support material in load');
    // }
    entity.opaque = true;
  }
  return [name, entity];
}

export function getMesh(node: THREE.Mesh): [MeshName, Mesh] {
  const name = node.geometry.uuid;
  const position = node.geometry.getAttribute('position');
  const normal = node.geometry.getAttribute('normal');
  const uv = node.geometry.getAttribute('uv');
  const index = node.geometry.index;
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
  if (node.geometry.boundingBox !== null) {
    const min = node.geometry.boundingBox.min;
    const max = node.geometry.boundingBox.max;
    mesh.bounds = {
      min: [min.x, min.y, min.z],
      max: [max.x, max.y, max.z],
    };
  }
  return [name, mesh];
}
