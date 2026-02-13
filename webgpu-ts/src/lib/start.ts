import { Renderer } from "./renderer";
import {
  Stage,
} from "./stage";

export interface InitState<a> {
  stage: Stage;
  app: a;
}

export interface State<a> {
  readonly deltaTime: number;
  readonly now: number;
  readonly frameNumber: number;
  readonly current: number;
  readonly prev: number;
  readonly stage: Stage;
  readonly renderer: Renderer;
  app: a;
}

export async function start<a>(args: {
  canvas: HTMLCanvasElement;
  init: (device: GPUDevice) => Promise<InitState<a>>;
  resize?: (state: State<a>, width: number, height: number) => void;
  update?: (state: State<a>) => State<a>;
}) {
  const resize = args.resize ?? (() => { });
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
    deltaTime: 0,
    now: performance.now(),
    frameNumber: 0,
    current: 0,
    prev: 1,
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
      current: Number(!state.current),
      prev: state.current,
    };
    state = update(state);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // Handle window resize.
  // https://webgpufundamentals.org/webgpu/lessons/webgpu-resizing-the-canvas.html
  const observer = new ResizeObserver((entries) => {
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
      renderer.resize({
        width: Math.max(1, Math.min(width, maxTextureDimension2D)),
        height: renderer.canvas.height = Math.max(1, Math.min(height, maxTextureDimension2D)),
      });
      resize(state, renderer.canvas.width, renderer.canvas.height);
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
