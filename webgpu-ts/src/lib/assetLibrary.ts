import type { BufferSlot } from "./assets/bufferBase";
import { EntityBuffer } from "./assets/entityBuffer";
import { IndexBuffer } from "./assets/indexBuffer";
import { VertexBuffer } from "./assets/vertexBuffer";
import { loadObj } from "./loaders/mesh.obj";
import type { Entity, EntityID } from "./scene";
import { stringHash } from "./stdlib";

// As a proof of concept, this only supports loading, not unloading.
// This means the entire scene must fit into GPU memory.
// To support data streaming, this must support unloading.
// TODO: Support unloading
// - This requires memory management like malloc (avoid fragmentation)
// TODO: add max memory usage (limit VRAM, useful for testing and sharing GPU)
// * Should be refreshed at 1-10 Hz for data streaming
// * Should probably be an async call to avoid freezing a frame
//   - On the first frame, call async
//   - Subsequent frames, check if done
//   - When done, upload changes to GPU
//   - If data is uploaded, wait until next cycle (each second?)
// * There must be a way to "force" upload data, regardless of the cycle
//   - Example: spawn a cube every time you click
//   - await request(...)
// * On each refresh:
//   - Track how many times a resource is requested
//   - Track when was the last time a resource was requested
//   - Eviction of unused resources (free up memory)
//     - Last time used > 5-10 s
//     - Distance within threshold
// * On resource request:
//   - If mesh doesn't fit in memory, force eviction
//   - If larger than a threshold, use lower LOD
//   - Evict Least Recently Used until enough memory
//     - Only if a lower LOD is loaded
//   - If nothing can be evicted, force LRU replacement in order
//     - Load one step lower LOD
//     - Unload current LOD

export type FilePattern = string;
export type AssetID = string;
export type AssetLOD = number;
export type RequestID = string;
export type AssetLoader = (id: AssetID, lod: AssetLOD) => Promise<Asset>;

export type AssetError = {
  tag: "AssetError";
  id: AssetID;
  lod: AssetLOD;
  reason: string;
};

export type Ref = {
  tag: "Ref";
  filename: string;
};
export type Mesh = {
  tag: "Mesh";
  id?: AssetID;
  // TODO: lods: {AssetLOD: {vertices, indices}}
  vertices: number[][];
  indices: number[]; // TODO: faces: number[][]
};
export type Asset = Ref | Mesh | AssetError;

export type Loading = {
  tag: "Loading";
  requestID: RequestID;
};
export type LoadedMesh = {
  tag: "LoadedMesh";
  vertices: BufferSlot;
  indices: BufferSlot;
};
export type LoadedAsset = Loading | LoadedMesh | AssetError;

// TODO: make this into a generic Library
export class AssetLibrary {
  loaders: Record<FilePattern, AssetLoader>;
  staged: Record<AssetID, LoadedAsset>;
  requests: Record<RequestID, Promise<Asset>>;
  entities: EntityBuffer; // TODO: remove this?
  vertexBuffer: VertexBuffer;
  indexBuffer: IndexBuffer;

  // TODO: Least Recently Used (LRU) list
  // TODO: configure chunkSize
  // TODO: configure maxChunks
  constructor(device: GPUDevice, loaders?: Record<AssetID, AssetLoader>) {
    this.loaders = {
      ...loaders,
      "*.obj": loadObj,
    };
    this.staged = {};
    this.requests = {};
    this.entities = new EntityBuffer(device);
    this.instances = {};
    this.vertexBuffer = new VertexBuffer(device);
    this.indexBuffer = new IndexBuffer(device);

    for (const pattern of Object.keys(this.loaders)) {
      console.log(`[AssetLibrary] using loader: ${pattern}`);
    }
  }

  stage(
    entities: { id: EntityID; entity: Entity; lod: AssetLOD }[],
    now: number,
  ) {
    // TODO: keep track on LRU of when an asset was used with `now`
    entities.map(async ({ id, entity, lod }) => {
      const asset = this.request(entity.asset, lod);
      console.log(id, asset);
    });
    // Figure out assetID from entity.asset
    // Save entity's transform linked to its id
    // request asset
  }

  isLoading(): boolean {
    return Object.keys(this.requests).length > 0;
  }

  request(asset: Asset, lod: AssetLOD = 0): LoadedAsset {
    const id = getAssetID(asset, lod);
    const staged = this.staged[id];
    if (staged !== undefined) {
      return staged;
    }

    // Not loaded, try to load it.
    const loaded = this.loadAsset(asset, lod);
    if (loaded.tag !== "Loading") {
      // Asset has been loaded, add it to staged.
      this.staged[id] = loaded;
      console.log(`[AssetLibrary.request] staged: ${id}`, loaded);
      return loaded;
    } else if (lod > 0) {
      // It's still loading, try a lower LOD.
      const lowerLOD = this.request(asset, lod - 1);
      if (lowerLOD.tag !== "Loading") {
        return lowerLOD;
      }
    }
    // Nothing else to try, return whatever `loadAsset` gave us.
    // This could either be Loading or a AssetError.
    return loaded;
  }

  loadAsset(asset: Asset, lod: AssetLOD): LoadedAsset {
    switch (asset.tag) {
      case "Ref":
        const reqID = `${asset.filename}:${lod}`;
        const request = this.requests[reqID];
        if (request === undefined) {
          // Create a new request.
          const loader = this.findFileLoader(asset.filename);
          if (loader === undefined) {
            throw new Error(
              `[LibraryMesh3D.load] Could not find a loader for: ${id}`,
            );
          }
          this.requests[reqID] = loader(asset.filename, lod)
            .then((asset) => {
              delete this.requests[reqID];
              return this.request(asset);
            })
            .catch((e) => {
              return e;
            })
            .finally(() => {});
        }
        return { tag: "Loading", requestID: reqID };

      case "Mesh":
        return {
          tag: "LoadedMesh",
          vertices: this.vertexBuffer.write(asset.vertices),
          indices: this.indexBuffer.write(asset.indices),
        };

      case "AssetError":
        return asset;
    }
  }

  free(id: AssetID, lod: AssetLOD) {
    throw new Error("TODO: LibraryMesh3D.free");
  }

  findFileLoader(id: AssetID): AssetLoader | undefined {
    // 1) Try exact match.
    const loader = this.loaders[id];
    if (loader !== undefined) {
      return loader;
    }
    for (const [pattern, loader] of Object.entries(this.loaders)) {
      // 2) Try glob pattern.
      const glob = pattern
        .split(/(\*\*|\*|\.)/)
        .map((tok) => ({ "**": ".*", "*": "[^/]*", ".": "\\." })[tok] ?? tok)
        .join("");
      if (id.match(glob)) {
        this.loaders[id] = loader; // cache it
        return loader;
      }

      // 3) Try regular expression.
      try {
        if (id.match(pattern)) {
          this.loaders[id] = loader; // cache it
          return loader;
        }
      } catch (_) {
        // Not a valid regular expression, just skip.
      }
    }
    return undefined;
  }
}

export function getAssetID(asset: Asset, lod: AssetLOD): AssetID {
  return `${getAssetIDBase(asset)}:${lod}`;
}

function getAssetIDBase(asset: Asset) {
  switch (asset.tag) {
    case "Ref":
      return asset.filename;
    case "Mesh":
      if (asset.id !== undefined) {
        return asset.id;
      }
      const hash = stringHash(JSON.stringify([asset.vertices, asset.indices]));
      return `Mesh<${hash}>`;
    case "AssetError":
      return `AssetError<${asset.id}:${asset.lod}>`;
  }
}
