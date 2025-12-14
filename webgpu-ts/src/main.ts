import * as library from "./lib/assetLibrary";
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

  const triangle = mesh({
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
    indices: [0, 1, 2],
  });

  const renderer = new Renderer(device, {
    scene: {
      triangle: triangle,
      // pyramid: ref({ filename: "assets/pyramid.obj" }),
    },
  });

  console.log("------------------");
  await renderer.stageScene();

  // const mesh = await renderer.assets.request("assets/triangle.obj");
  // console.log(mesh);

  const renderPassDescriptor: GPURenderPassDescriptor = {
    label: "our basic canvas renderPass",
    colorAttachments: [
      {
        // view: <- to be filled out when we render
        // view: context.getCurrentTexture()?.createView()!,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],

    // depthStencilAttachment: {
    //   // view: <- to be filled out when we render
    //   depthClearValue: 1.0,
    //   depthLoadOp: "clear",
    //   depthStoreOp: "store",
    // },
  };

  let viewMatrix = new Float32Array(4 * 4);
  mat4.projection(canvas.clientWidth, canvas.clientHeight, 400, viewMatrix);

  let lastRenderTime = 0;
  function render(now: number) {
    const startTime = performance.now();

    // Set the render texture.
    // This must be done every frame because the WebGPU specification
    // allows browsers to return a different texture every time
    // getCurrentTexture() is called (browser optimizations).
    renderPassDescriptor.colorAttachments[0].view = context!
      .getCurrentTexture()
      .createView();

    const encoder = device.createCommandEncoder();
    {
      // Main render pass.
      const pass = encoder.beginRenderPass(renderPassDescriptor);

      // mesh.getViewMatrix().set(viewMatrix);
      // mesh.translate([200, 200, 0]);
      // mesh.rotate([40, 25, 325]);
      // mesh.scale([100, 100, 100]);
      // mesh.render(pass);

      pass.end();
    }
    device.queue.submit([encoder.finish()]);

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
    // requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  // https://webgpufundamentals.org/webgpu/lessons/webgpu-resizing-the-canvas.html
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width =
        entry.devicePixelContentBoxSize?.[0].inlineSize ||
        entry.contentBoxSize[0].inlineSize * devicePixelRatio;
      const height =
        entry.devicePixelContentBoxSize?.[0].blockSize ||
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
