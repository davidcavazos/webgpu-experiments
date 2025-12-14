import {
  AssetLibrary,
  type Asset,
  type AssetID,
  type AssetLoader,
  type AssetLOD,
  type FilePattern,
  type Mesh,
} from "./assetLibrary";
import type { Scene } from "./scene";

export class Renderer {
  // camera: Camera
  scene: Scene;
  assets: AssetLibrary;

  constructor(
    device: GPUDevice,
    args?: {
      scene?: Scene;
      loaders?: Record<FilePattern, AssetLoader>;
    },
  ) {
    this.assets = new AssetLibrary(device, args?.loaders);
    this.scene = args?.scene ?? {};
    this.stageScene();
  }

  stageScene(now?: number) {
    const entities = Object.entries(this.scene).map(([id, entity]) => ({
      id,
      entity,
      lod: 0,
    }));
    return this.assets.stage(entities, now ?? performance.now());
  }

  isLoading(): boolean {
    return this.assets.isLoading();
  }

  // levelOfDetail(
  //   entityTransform: Float32Array,
  //   cameraTransform: Float32Array,
  // ): AssetLOD {
  //   // TODO: calculate level of detail
  //   // - use distance
  //   // - configurable settings
  //   // - 3 to 5 LODs
  //   return 0;
  // }
}
