import * as io from "./lib/io";
import * as library from "./lib/engine";
import { loadObj } from "./lib/loaders/mesh.obj";
import { mat4 } from "./lib/mat4";
import { Renderer } from "./lib/renderer";
import { entity, mesh, ref, type Entity } from "./lib/scene";

const canvas: HTMLCanvasElement = document.querySelector("#canvas")!;
const info = document.querySelector("#info")!;

export async function start(
  canvas: HTMLCanvasElement,
  main: (device: GPUDevice) => void,
) {
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
      start(canvas, main);
    }
  });

  // Start the app
  console.log(device);
  main(device);
}

start(canvas, async (device: GPUDevice) => {
  const context = canvas.getContext("webgpu");
  if (!context) {
    throw Error("Could not get a WebGPU context.");
  }
  context.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: "premultiplied",
  });

  const mouse = new io.Mouse(canvas);

  const renderer = new Renderer({
    device,
    canvas,
    context,
    scene: {
      triangle1: mesh({
        id: "triangle-mesh",
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        indices: [0, 1, 2],
        transform: mat4.translate(mat4.identity(), [0, 0, -4]),
      }),
      triangle2: mesh({
        id: "triangle-mesh",
        transform: mat4.scale(
          mat4.translate(mat4.identity(), [-0.5, -1, -4]),
          [0.5, 0.5, 0.5],
        ),
      }),
      // pyramid1: ref({ filename: "assets/pyramid.obj" }),
    },
  });

  let lastRenderTime = 0;
  function render(now: number) {
    const startTime = performance.now();

    const inputs = {
      mouse: mouse.poll(),
    };
    if (inputs.mouse.moved && inputs.mouse.pressedLeft) {
      console.log(inputs.mouse.position);
    }

    // Stage and draw the scene.
    renderer.draw(now);

    // Performance metrics
    if (Math.floor(now * 0.02) !== Math.floor(lastRenderTime * 0.02)) {
      const elapsed = performance.now() - startTime;
      const fps = 1000 / (now - lastRenderTime);
      info.textContent = [
        `fps:  ${fps.toFixed(1)}`,
        `time: ${elapsed.toFixed(1)} ms`,
      ].join("\n");
    }
    lastRenderTime = now;
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  // Handle window resize.
  // https://webgpufundamentals.org/webgpu/lessons/webgpu-resizing-the-canvas.html
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width =
        entry.devicePixelContentBoxSize?.[0]?.inlineSize ||
        entry.contentBoxSize[0].inlineSize * devicePixelRatio;
      const height =
        entry.devicePixelContentBoxSize?.[0]?.blockSize ||
        entry.contentBoxSize[0].blockSize * devicePixelRatio;
      //   const canvas: HTMLCanvasElement = entry.target;
      canvas.width = Math.max(
        1,
        Math.min(width, device.limits.maxTextureDimension2D),
      );
      canvas.height = Math.max(
        1,
        Math.min(height, device.limits.maxTextureDimension2D),
      );
      requestAnimationFrame(render);
    }
  });
  try {
    observer.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(canvas, { box: "content-box" });
  }
});
