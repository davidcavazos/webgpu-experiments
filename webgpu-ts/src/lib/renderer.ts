import {
  AssetLibrary,
  type Asset,
  type AssetID,
  type AssetLoader,
  type FilePattern,
  type Mesh,
} from "./assetLibrary";
import type { Scene } from "./scene";

export class Renderer {
  // camera: Camera
  assets: AssetLibrary;

  constructor(
    device: GPUDevice,
    args?: {
      scene?: Scene;
      loaders?: Record<FilePattern, AssetLoader>;
    },
  ) {
    this.assets = new AssetLibrary(device, args?.loaders);
    if (args?.scene) {
      this.loadScene(args.scene);
    }
  }

  loadScene(scene: Scene) {
    console.log("loadScene");
  }
}
