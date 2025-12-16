import type { BufferSlot } from "./assets/bufferBase";
import { EntityBuffer, type EntityBufferSlot } from "./assets/entityBuffer";
import { IndexBuffer, type IndexBufferSlot } from "./assets/indexBuffer";
import { VertexBuffer, type VertexBufferSlot } from "./assets/vertexBuffer";
import { loadObj } from "./loaders/mesh.obj";
import type { Entity, EntityID } from "./scene";
import { parseInt, stringHash } from "./stdlib";

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
  id: RequestID;
};
export type LoadedMesh = {
  tag: "LoadedMesh";
  vertices: VertexBufferSlot;
  indices: IndexBufferSlot;
};
export type LoadedAsset = Loading | LoadedMesh | AssetError;

export interface BatchDraw {
  entities: EntityBufferSlot;
  vertices: VertexBufferSlot;
  indices: IndexBufferSlot;
}

// TODO: make the engine API-agnostic
// - remove all mentions of WebGPU, use wrappers instead
// - include an interface for an API implementation (eg. WebGPU, Vulkan)
export class Engine {
  readonly loaders: Record<FilePattern, AssetLoader>;
  staged: Record<AssetID, LoadedAsset>;
  loading: Record<RequestID, Promise<Asset>>;
  passes: {
    opaque: Record<AssetID, BatchDraw>;
  };
  entityBuffer: EntityBuffer;
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
    this.loading = {};
    this.passes = {
      opaque: {},
    };
    this.entityBuffer = new EntityBuffer(device);
    this.vertexBuffer = new VertexBuffer(device);
    this.indexBuffer = new IndexBuffer(device);

    for (const pattern of Object.keys(this.loaders)) {
      console.log(`[AssetLibrary] using loader: ${pattern}`);
    }
  }

  stage(scene: { entity: Entity; lod: AssetLOD }[], now: number) {
    // TODO: keep track on LRU of when an asset was used with `now`
    let opaques: Record<AssetID, { entities: Entity[]; asset: LoadedMesh }> =
      {};
    for (const { entity, lod } of scene) {
      const { id, asset } = this.request(entity.asset, lod);
      switch (asset.tag) {
        case "LoadedMesh":
          if (id in opaques) {
            opaques[id]?.entities.push(entity);
          } else {
            opaques[id] = { entities: [entity], asset };
          }
          break;
      }
    }
    this.entityBuffer.clear();
    this.passes = {
      opaque: Object.fromEntries(
        Object.entries(opaques).map(([id, { entities, asset }]) => {
          const batch: BatchDraw = {
            entities: this.entityBuffer.write(entities),
            vertices: asset.vertices,
            indices: asset.indices,
          };
          return [id, batch];
        }),
      ),
    };
    // scene.map(async ({ id, entity, lod }) => {
    //   const staged = this.request(entity.asset, lod);
    //   const slot = this.entities.write(entity);
    //   if (!(staged.id in this.passes.opaque)) {
    //     this.passes.opaque[staged.id] = [];
    //   }
    //   this.passes.opaque[staged.id]?.push({
    //     id,
    //     entity: slot,
    //   });
    // });
  }

  isLoading(): boolean {
    return Object.keys(this.loading).length > 0;
  }

  splitAssetID(id: AssetID): { base: string; lod: AssetLOD } {
    const [base, lod] = id.split(":", 2);
    return { base: base ?? "", lod: parseInt(lod ?? "0") };
  }

  isLowerLOD(id1: AssetID, id2: AssetID): boolean {
    const x = this.splitAssetID(id1);
    const y = this.splitAssetID(id2);
    return x.base === y.base && x.lod < y.lod;
  }

  request(
    asset: Asset,
    lod: AssetLOD = 0,
  ): { id: AssetID; asset: LoadedAsset } {
    const id = getAssetID(asset, lod);
    if (!(id in this.staged)) {
      // Not loaded, try to load it.
      this.staged[id] = this.loadAsset(id, asset, lod);
    }
    const staged = this.staged[id]!;
    if (staged.tag === "Loading") {
      // Still loading, try to find a lower LOD.
      const lowerAssetId = Object.keys(this.staged)
        .filter((id2) => this.isLowerLOD(id, id2))
        .sort()[0];
      if (lowerAssetId !== undefined) {
        return { id, asset: this.staged[lowerAssetId]! };
      }
    }
    // Nothing else to try, return whatever `loadAsset` gave us.
    // This could either be Loading or a AssetError.
    return { id, asset: staged };
  }

  loadAsset(id: AssetID, asset: Asset, lod: AssetLOD): LoadedAsset {
    switch (asset.tag) {
      case "Ref":
        const request = this.loading[id];
        if (request === undefined) {
          // Create a new request.
          const loader = this.findFileLoader(asset.filename);
          if (loader === undefined) {
            throw new Error(
              `[LibraryMesh3D.load] Could not find a loader for: ${id}`,
            );
          }
          this.loading[id] = loader(asset.filename, lod)
            .then((asset) => {
              delete this.loading[id];
              return this.request(asset);
            })
            .catch((e) => {
              return e;
            })
            .finally(() => {});
        }
        return { tag: "Loading", id };

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
