import type { BufferSlot } from "./assets/bufferBase";
import { IndexBuffer } from "./assets/indexBuffer";
import { VertexBuffer } from "./assets/vertexBuffer";
import { loadObj } from "./loaders/mesh.obj";
import type { EntityID } from "./scene";

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
export type AssetLoader = (
  id: AssetID,
  lod: AssetLOD,
) => Promise<Asset | undefined>;

export type Mesh = {
  tag: "Mesh";
  vertices: number[][];
  indices: number[]; // TODO: faces: number[][]
};
export type Asset = Mesh;

export type LoadedMesh = {
  tag: "LoadedMesh";
  vertices: BufferSlot;
  indices: BufferSlot;
};
export type LoadedAsset = LoadedMesh;

// TODO: make this into a generic Library
export class AssetLibrary {
  loaders: Record<FilePattern, AssetLoader>;
  assets: Record<AssetID, Record<AssetLOD, LoadedAsset>>;
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
    this.assets = {};
    this.vertexBuffer = new VertexBuffer(device);
    this.indexBuffer = new IndexBuffer(device);

    for (const pattern of Object.keys(this.loaders)) {
      console.log(`[AssetLibrary] using loader: ${pattern}`);
    }
  }

  async request(
    id: AssetID,
    lod: AssetLOD = 0,
  ): Promise<LoadedAsset | undefined> {
    const asset = this.assets[id];
    if (asset === undefined) {
      this.assets[id] = {};
    }

    // Try to get the LOD if it's already loaded.
    const cached = asset?.[lod];
    if (cached !== undefined) {
      return cached;
    }

    // Not loaded, try to load it.
    const loader = this.findLoader(id);
    if (loader === undefined) {
      console.error(`[LibraryMesh3D.load] Could not find a loader for: ${id}`);
      return undefined;
    }
    const data = await loader(id, lod);
    if (data !== undefined) {
      const mesh = this.load(data);
      this.assets[id]![lod] = mesh;
      return mesh;
    }

    // Couldn't load it, try a lower LOD.
    if (lod > 0) {
      console.debug(
        `[LibraryMesh3D.request] Could not load ${id}.lod${lod}, using ${id}.lod${lod - 1}`,
      );
      const lowerLOD = await this.request(id, lod - 1);
      if (lowerLOD !== undefined) {
        this.assets[id]![lod] = lowerLOD;
        return lowerLOD;
      }
    }

    // Nothing else to try, log the error and fail.
    console.error(`[LibraryMesh3D.request] Could not load: ${id} (lod=${lod})`);
    return undefined;
  }

  findLoader(id: AssetID): AssetLoader | undefined {
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
      if (id.match(pattern)) {
        this.loaders[id] = loader; // cache it
        return loader;
      }
    }
    return undefined;
  }

  load(asset: Asset): LoadedAsset {
    switch (asset.tag) {
      case "Mesh":
        return {
          tag: "LoadedMesh",
          vertices: this.vertexBuffer.write(asset.vertices),
          indices: this.indexBuffer.write(asset.indices),
        };
    }
  }

  free(id: AssetID, lod: AssetLOD) {
    throw new Error("TODO: LibraryMesh3D.free");
  }
}
