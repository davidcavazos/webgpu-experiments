import {
  Renderer,
  type Entity,
  type EntityId,
  type Material,
  type MaterialId,
  type Mesh,
  type MeshId,
} from "./renderer";
import type { Mat4 } from "wgpu-matrix";
import type { Transform } from "./transform";

export interface InitState<a> {
  camera?: {
    projection?: Mat4;
    transform?: Transform;
  };
  scene?: [EntityId, Entity][];
  meshes?: [MeshId, Mesh][];
  materials?: [MaterialId, Material][];
  app: a;
}

export interface State<a> {
  readonly frameNumber: number;
  readonly deltaTime: number;
  readonly now: number;
  renderer: Renderer;
  app: a;
}

export async function start<a>(args: {
  canvas: HTMLCanvasElement;
  init: (renderer: Renderer) => Promise<InitState<a>>;
  resize?: (projection: Mat4, width: number, height: number) => Mat4;
  update?: (state: State<a>) => State<a>;
  updateAfterDraw?: (state: State<a>) => State<a>;
  camera?: EntityId;
}) {
  const resize = args.resize ?? ((m, _w, _h) => m);
  const update = args.update ?? ((s) => s);
  const updateAfterDraw = args.updateAfterDraw ?? ((s) => s);

  // Get the GPU device
  if (!navigator.gpu) {
    window.alert("this browser does not support WebGPU");
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    window.alert("this browser supports webgpu but it appears disabled");
    return;
  }
  const device = await adapter.requestDevice({
    requiredFeatures: ["shader-f16", "indirect-first-instance"],
  });
  device.lost.then((info) => {
    window.alert(`WebGPU device was lost: ${info.message}`);
    if (info.reason !== "destroyed") {
      start(args);
    }
  });

  const context = args.canvas.getContext("webgpu");
  if (!context) {
    throw Error("Could not get a WebGPU context.");
  }
  context.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: "premultiplied",
  });

  const renderer = new Renderer(device, {
    // context,
    // width: args.canvas.width,
    // height: args.canvas.height,
  });
  const initialState = await args.init(renderer);
  let state: State<a> = {
    frameNumber: 0,
    deltaTime: 0,
    now: performance.now(),
    renderer,
    app: initialState.app,
  };
  // if (initialState.camera?.projection) {
  //   renderer.camera.projection = initialState.camera.projection;
  // }
  // if (initialState.camera?.transform) {
  //   renderer.camera.transform = initialState.camera.transform;
  // }
  // for (const [id, mesh] of initialState.meshes ?? []) {
  //   renderer.meshes.resources.set(id, mesh);
  // }
  // for (const [id, material] of initialState.materials ?? []) {
  //   renderer.materials.resources.set(id, material);
  // }
  // for (const [id, entity] of initialState.scene ?? []) {
  //   renderer.setEntity([id], entity);
  // }

  function render(nowMilliseconds: number) {
    const now = nowMilliseconds * 0.001;
    if (now === state.now) {
      return;
    }
    state = {
      ...state,
      deltaTime: now - state.now,
      now,
      frameNumber: state.frameNumber + 1,
    };

    state = update(state);
    renderer.draw();
    state = updateAfterDraw(state);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // Handle window resize.
  // https://webgpufundamentals.org/webgpu/lessons/webgpu-resizing-the-canvas.html
  const observer = new ResizeObserver((entries) => {
    // Multiple cameras can be for:
    // - Different angles on a cinematic
    // - Local multi-player
    // - Render on texture
    // - Environment maps
    // Maybe just having a hardcoded main camera to begin with
    // - The camera must be placed on the scene graph
    // - It should be able to be a child of an entity (like the player)
    // - Maybe camera should contain (projection, canvas) or some sort of (width, height)
    // - Maybe some reference to the canvas?
    // The canvas should contain the camera projection and camera entity ID
    // - The entity should contain the view transform
    for (const entry of entries) {
      const width =
        entry.devicePixelContentBoxSize?.[0]?.inlineSize ||
        (entry.contentBoxSize[0]?.inlineSize || args.canvas.width) *
        devicePixelRatio;
      const height =
        entry.devicePixelContentBoxSize?.[0]?.blockSize ||
        (entry.contentBoxSize[0]?.blockSize || args.canvas.height) *
        devicePixelRatio;
      //   const canvas: HTMLCanvasElement = entry.target;
      const maxTextureDimension2D = device.limits.maxTextureDimension2D;
      args.canvas.width = Math.max(1, Math.min(width, maxTextureDimension2D));
      args.canvas.height = Math.max(1, Math.min(height, maxTextureDimension2D));
      // renderer.camera.projection = resize(
      //   renderer.camera.projection,
      //   args.canvas.width,
      //   args.canvas.height,
      // );
      // renderer.updateCameraViewProjection();
      // renderer.depthTexture.destroy();
      // renderer.depthTexture = renderer.createDepthTexture(
      //   args.canvas.width,
      //   args.canvas.height,
      // );
      requestAnimationFrame(render);
    }
  });
  try {
    observer.observe(args.canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(args.canvas, { box: "content-box" });
  }
}
