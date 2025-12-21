import { Engine, start, type State } from "./lib/engine";
import * as io from "./lib/io";
import { loadObj } from "./lib/loaders/mesh.obj";
import { mat4 } from "./lib/mat4";
import { entity, mesh, ref, type Entity } from "./lib/scene";

const canvas: HTMLCanvasElement = document.querySelector("#canvas")!;
interface App {
  metrics: {
    infoHtmlElement: Element;
    lastRenderTime: number;
    startTime: number;
  };
}

async function init(engine: Engine<App>): Promise<State<App>> {
  // Check for shader compilation errors.
  const messages = await engine.shaderCompilationMessages();
  if (messages.info.length > 0) {
    console.log("--- Shader info messages ---");
    for (const msg of messages.info) {
      console.log(msg);
    }
  }
  if (messages.warnings.length > 0) {
    console.log("--- Shader warnings ---");
    for (const msg of messages.info) {
      console.log(`⚠️ ${msg}`);
    }
  }
  if (messages.errors.length > 0) {
    console.log("--- Shader errors ---");
    for (const msg of messages.errors) {
      console.error(msg);
    }
    throw new Error("Shader compilation errors");
  }

  // Build/load the initial scene.
  const scene = {
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
  };

  // Return the initial state.
  return {
    scene,
    app: {
      metrics: {
        infoHtmlElement: document.querySelector("#info")!,
        lastRenderTime: 0,
        startTime: 0,
      },
    },
  };
}

function update(state: State<App>, now: number): State<App> {
  state.app.metrics.startTime = performance.now();
  return state;
}

function updateAfterDraw(state: State<App>, now: number): State<App> {
  // Display performance metrics.
  const metrics = state.app.metrics;
  if (Math.floor(now * 0.02) !== Math.floor(metrics.lastRenderTime * 0.02)) {
    const elapsed = performance.now() - metrics.startTime;
    const fps = 1000 / (now - metrics.lastRenderTime);
    metrics.infoHtmlElement.textContent = [
      `fps:  ${fps.toFixed(1)}`,
      `time: ${elapsed.toFixed(1)} ms`,
    ].join("\n");
  }
  state.app.metrics.lastRenderTime = now;
  return state;
}

start({ canvas, init, update, updateAfterDraw });

// start(canvas, async (device: GPUDevice) => {
//   const context = canvas.getContext("webgpu");
//   if (!context) {
//     throw Error("Could not get a WebGPU context.");
//   }
//   context.configure({
//     device,
//     format: navigator.gpu.getPreferredCanvasFormat(),
//     alphaMode: "premultiplied",
//   });

//   const mouse = new io.Mouse(canvas);
//   const scene = {
//     triangle1: mesh({
//       id: "triangle-mesh",
//       vertices: [
//         [0, 0, 0],
//         [1, 0, 0],
//         [0, 1, 0],
//       ],
//       indices: [0, 1, 2],
//       transform: mat4.translate(mat4.identity(), [0, 0, -4]),
//     }),
//     triangle2: mesh({
//       id: "triangle-mesh",
//       transform: mat4.scale(
//         mat4.translate(mat4.identity(), [-0.5, -1, -4]),
//         [0.5, 0.5, 0.5],
//       ),
//     }),
//     // pyramid1: ref({ filename: "assets/pyramid.obj" }),
//   };

//   // const renderer = new Renderer({ device, canvas, context });
//   const engine = new Engine();

//   let lastRenderTime = 0;
//   function render(now: number) {
//     const startTime = performance.now();

//     const inputs = {
//       mouse: mouse.poll(),
//     };
//     if (inputs.mouse.moved && inputs.mouse.pressedLeft) {
//       console.log(inputs.mouse.position);
//     }

//     // Stage and draw the scene.
//     // renderer.draw(scene, now);

//     // Performance metrics
//     if (Math.floor(now * 0.02) !== Math.floor(lastRenderTime * 0.02)) {
//       const elapsed = performance.now() - startTime;
//       const fps = 1000 / (now - lastRenderTime);
//       info.textContent = [
//         `fps:  ${fps.toFixed(1)}`,
//         `time: ${elapsed.toFixed(1)} ms`,
//       ].join("\n");
//     }
//     lastRenderTime = now;
//     requestAnimationFrame(render);
//   }

//   requestAnimationFrame(render);

//   // Handle window resize.
//   // https://webgpufundamentals.org/webgpu/lessons/webgpu-resizing-the-canvas.html
//   const observer = new ResizeObserver((entries) => {
//     for (const entry of entries) {
//       const width =
//         entry.devicePixelContentBoxSize?.[0]?.inlineSize ||
//         entry.contentBoxSize[0].inlineSize * devicePixelRatio;
//       const height =
//         entry.devicePixelContentBoxSize?.[0]?.blockSize ||
//         entry.contentBoxSize[0].blockSize * devicePixelRatio;
//       //   const canvas: HTMLCanvasElement = entry.target;
//       canvas.width = Math.max(
//         1,
//         Math.min(width, device.limits.maxTextureDimension2D),
//       );
//       canvas.height = Math.max(
//         1,
//         Math.min(height, device.limits.maxTextureDimension2D),
//       );
//       requestAnimationFrame(render);
//     }
//   });
//   try {
//     observer.observe(canvas, { box: "device-pixel-content-box" });
//   } catch {
//     observer.observe(canvas, { box: "content-box" });
//   }
// });
