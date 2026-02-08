import { Renderer } from "./renderer";
import {
  Stage,
} from "./stage";

export interface InitState<a> {
  stage: Stage;
  app: a;
}

export interface State<a> {
  readonly frameNumber: number;
  readonly deltaTime: number;
  readonly now: number;
  readonly stage: Stage;
  readonly renderer: Renderer;
  app: a;
}

export async function start<a>(args: {
  canvas: HTMLCanvasElement;
  init: (device: GPUDevice) => Promise<InitState<a>>;
  update?: (state: State<a>) => State<a>;
}) {
  const update = args.update ?? (s => s);

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

  const { stage, app } = await args.init(device);
  const renderer = new Renderer(device, {
    canvas: args.canvas,
    stage,
  });
  let state: State<a> = {
    frameNumber: 0,
    deltaTime: 0,
    now: performance.now(),
    stage,
    renderer,
    app,
  };

  function render(nowMilliseconds: number) {
    const now = nowMilliseconds * 0.001; // to seconds
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
        (entry.contentBoxSize[0]?.inlineSize || renderer.canvas.width) *
        devicePixelRatio;
      const height =
        entry.devicePixelContentBoxSize?.[0]?.blockSize ||
        (entry.contentBoxSize[0]?.blockSize || renderer.canvas.height) *
        devicePixelRatio;
      //   const canvas: HTMLCanvasElement = entry.target;
      const maxTextureDimension2D = device.limits.maxTextureDimension2D;
      renderer.canvas.width = Math.max(1, Math.min(width, maxTextureDimension2D));
      renderer.canvas.height = Math.max(1, Math.min(height, maxTextureDimension2D));
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
