import { mat4 } from "wgpu-matrix";
import type { Globals } from "./assets/globals";
import { Engine } from "./engine";
import { type Entity, type EntityID, type Scene } from "./scene";

export interface InitState<a> {
  scene: Scene;
  app: a;
}

export interface State<a> {
  readonly frameNumber: number;
  readonly deltaTime: number;
  readonly now: number;
  defaultCamera: Entity;
  globals: Globals;
  scene: Scene;
  app: a;
}

export async function start<a>(args: {
  canvas: HTMLCanvasElement;
  projection: (width: number, height: number) => Float32Array;
  init: (engine: Engine) => Promise<InitState<a>>;
  update?: (state: State<a>) => State<a>;
  updateAfterDraw?: (state: State<a>) => State<a>;
  camera?: EntityID;
}) {
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
  const device = await adapter.requestDevice();
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

  const engine = new Engine({ device, canvas: args.canvas, context });

  const initialState = await args.init(engine);
  let state: State<a> = {
    scene: initialState.scene,
    app: initialState.app,
    defaultCamera: {
      asset: { tag: "Node" },
      transform: mat4.identity(),
      entities: {},
    },
    globals: engine.globals,
    frameNumber: 0,
    deltaTime: 0,
    now: performance.now(),
  };

  engine.globals.projection.set(
    args.projection(args.canvas.width, args.canvas.height),
  );
  function render(now: number) {
    if (now === state.now) {
      return;
    }
    state = {
      ...state,
      deltaTime: (now - state.now) * 0.001,
      now: now,
      frameNumber: state.frameNumber + 1,
    };

    if (args.update) {
      state = args.update(state);
    }
    engine.draw(state.scene, now);
    if (args.updateAfterDraw) {
      state = args.updateAfterDraw(state);
    }
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
      args.canvas.width = Math.max(
        1,
        Math.min(width, device.limits.maxTextureDimension2D),
      );
      args.canvas.height = Math.max(
        1,
        Math.min(height, device.limits.maxTextureDimension2D),
      );
      engine.globals.projection.set(
        args.projection(args.canvas.width, args.canvas.height),
      );
      requestAnimationFrame(render);
    }
  });
  try {
    observer.observe(args.canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(args.canvas, { box: "content-box" });
  }
}
