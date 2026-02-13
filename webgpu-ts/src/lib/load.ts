import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { vec3 } from "wgpu-matrix";
import type { Scene } from "./scene";
import type { Entity, EntityName } from "./entities";
import type { Geometry, Mesh, MeshName, Vertex } from "./meshes";
import type { Material, MaterialName } from "./materials";

export async function load(url: string): Promise<Scene> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return toScene(gltf.scene);
}

function toScene(node: THREE.Object3D): Scene {
  const scene: Scene = {
    entities: {},
    meshes: {},
    materials: {},
  };
  const entity = toEntity(node);
  if (node.type === 'Mesh') {
    const [meshName, mesh] = toMesh(node as THREE.Mesh);
    entity.mesh = meshName;
    scene.meshes = { ...scene.meshes, [meshName]: mesh };
    const [materialName, material] = toMaterial(node as THREE.Mesh);
    entity.material = materialName;
    scene.materials = { ...scene.materials, [materialName]: material };
    entity.opaque = material.opaque;
  }
  let children: [EntityName, Entity][] = [];
  for (const child of node.children) {
    const { entities, meshes, materials } = toScene(child);
    children.push(...Object.entries(entities));
    scene.meshes = { ...scene.meshes, ...meshes };
    scene.materials = { ...scene.materials, ...materials };
  }
  if (children.length > 0) {
    entity.children = Object.fromEntries(children);
  }
  scene.entities = { [entity.name]: entity };
  return scene;
}

function toEntity(node: THREE.Object3D): Entity {
  const entity: Entity = {
    name: node.name,
    transform: {
      position: [node.position.x, node.position.y, node.position.z],
      rotation: [
        node.quaternion.x,
        node.quaternion.y,
        node.quaternion.z,
        node.quaternion.w,
      ],
      scale: (node.scale.x + node.scale.y + node.scale.z) / 3.0,
    },
  };
  return entity;
}

function toMesh(node: THREE.Mesh): [MeshName, Mesh] {
  const name = node.geometry.uuid;
  const position = node.geometry.getAttribute('position');
  const normal = node.geometry.getAttribute('normal');
  const uv = node.geometry.getAttribute('uv');
  const index = node.geometry.index;
  const geometry: Geometry = {
    vertices: Array.from({ length: position.count }, (_, i): Vertex => ({
      position: [position.getX(i), position.getY(i), position.getZ(i)],
      normal: [normal.getX(i), normal.getY(i), normal.getZ(i)],
      uv: [uv.getX(i), uv.getY(i)],
    })),
    indices: {
      lod0: [...index?.array ?? []].reverse(),
    }
  };
  const bounds = { min: vec3.create(), max: vec3.create() };
  if (node.geometry.boundingBox !== null) {
    const min = node.geometry.boundingBox.min;
    const max = node.geometry.boundingBox.max;
    vec3.copy([min.x, min.y, min.z], bounds.min);
    vec3.copy([max.x, max.y, max.z], bounds.max);
  } else {
    for (const v of geometry.vertices) {
      vec3.min(bounds.min, v.position);
      vec3.max(bounds.max, v.position);
    }
  }
  const mesh: Mesh = { loader: async () => geometry, bounds };
  return [name, mesh];
}

function toMaterial(node: THREE.Mesh): [MaterialName, Material] {
  if (Array.isArray(node.material)) {
    // TODO: use node.geometry.groups to map the materials array.
    throw new Error('load.toMaterial: material arrays not yet supported.');
  }
  // TODO: actually load material properties.
  const name = node.material.name;
  const material: Material = { opaque: true };
  return [name, material];
}
