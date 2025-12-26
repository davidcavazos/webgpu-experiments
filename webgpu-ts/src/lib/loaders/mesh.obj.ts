import { vec3 } from "wgpu-matrix";
import type {
  AssetDescriptor,
  AssetID,
  AssetLOD,
  MeshDescriptor,
} from "../asset";
import { toFixedLength } from "../stdlib";

export interface MeshObj {
  positions: number[][];
  normals: number[][];
  uvs: number[][];
  faces: string[][];
}

export async function loadObj(
  filename: string,
  lod: AssetLOD = 0,
): Promise<AssetDescriptor> {
  if (lod !== 0) {
    return {
      tag: "AssetError",
      id: filename,
      lod: lod,
      reason:
        "[loaders/mesh.obj.ts:loadObj] LOD higher than 0 not yet supported",
    };
  }
  try {
    const resp = await fetch(filename);
    if (!resp.ok) {
      return {
        tag: "AssetError",
        id: filename,
        lod: lod,
        reason: `[loaders/mesh.obj.ts:loadObj] ${resp.statusText}`,
      };
    }
    const contents = await resp.text();
    return parseObj(filename, contents);
  } catch (e) {
    return {
      tag: "AssetError",
      id: filename,
      lod: lod,
      reason: `[loaders/mesh.obj.ts:loadObj] ${e}`,
    };
  }
}

export function parseObj(id: AssetID, contents: string): MeshDescriptor {
  // https://en.wikipedia.org/wiki/Wavefront_.obj_file
  const obj: MeshObj = { positions: [], uvs: [], normals: [], faces: [] };
  for (const line of contents.split("\n")) {
    const [id, ...data] = line.trim().split(/\s+/);
    switch (id) {
      case "v": // vertex position
        obj.positions.push(data.map(parseFloat));
        break;
      case "vn": // vertex normal
        obj.normals.push(data.map(parseFloat));
        break;
      case "vt": // vertex texture uv
        obj.uvs.push(data.map(parseFloat));
        break;
      case "f": // face (polygon)
        // TODO: normalize faces here (always include all three '/')
        // > this allows correct reuse of vertices
        //   eg. 1   should normalize to 1//
        //   eg. 1/2 should normalize to 1/2/
        //   -- shouldn't be an issue with machine-made files (eg. Blender).
        obj.faces.push(data);
        break;
      case undefined:
      case "": // Empty line, skip.
        break;
      default:
        if (id.startsWith("#")) {
          // Comment, skip.
          break;
        }
        console.error(`[mesh3d.obj.parseObj] Not supported: ${id}`);
    }
  }
  return objToMesh(id, obj);
}

export function objToMesh(id: AssetID, obj: MeshObj): MeshDescriptor {
  // The same vertex position could have different uv or normals.
  // Each vertex is a unique combination of (vertex, uv, normal).
  const uniqueFaces = [...new Set(obj.faces.flat())].sort();

  const vertices: number[][] = uniqueFaces.map((face) => {
    // TODO: handle quads and ngons
    // Obj face format:
    //   v/vt/n == pos/uv/norm
    const faceData = toFixedLength(face.split("/"), 3, "")
      .map((x) => (x === "" ? "1" : x))
      .map(parseInt)
      .map((i) => i - 1); // convert from 1-based to 0-based index
    const posId = faceData[0]!;
    const uvId = faceData[1]!;
    const normId = faceData[2]!;
    // Vertex data format:
    //   (pos.x, pos.y, pos.z, norm.x, norm.y, norm.z, uv.x, uv.y)
    // If it's undefined, default to (0, 0, 0)
    const position = posId < obj.positions.length ? obj.positions[posId]! : [];
    // If normals are undefined, compute flat faces.
    let normals =
      normId < obj.normals.length
        ? obj.normals[normId]!
        : // TODO: compute flat faces, it currently assigns normals to positions
          //  Good for debug visualizing, but not a good default overall.
          [...vec3.normalize(position)];
    // If UVs are udefined, default to (0, 0)
    const uvs = uvId < obj.uvs.length ? obj.uvs[uvId]! : [];
    return [
      ...toFixedLength(position, 3, 0),
      ...toFixedLength(normals, 3, 0),
      ...toFixedLength(uvs, 2, 0),
    ];
  });
  const indices = obj.faces.flat().map((face) => uniqueFaces.indexOf(face));
  return { tag: "MeshDescriptor", id, vertices, indices };
}
