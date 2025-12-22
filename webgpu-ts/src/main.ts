import {
  Engine,
  start,
  type InitState as StateInit,
  type State,
} from "./lib/engine";
import * as io from "./lib/io";
import { mat4 } from "./lib/mat4";
import { camera, mesh } from "./lib/scene";

const canvas: HTMLCanvasElement = document.querySelector("#canvas")!;

interface App {
  input: {
    mouse: io.Mouse;
    keyboard: io.Keyboard;
  };
  metrics: {
    infoHtmlElement: Element;
    drawStartTime: number;
    updateElapsed: number;
  };
}

async function init(engine: Engine): Promise<StateInit<App>> {
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
    mycamera: camera({
      projection: mat4.perspective(
        engine.canvas.width,
        engine.canvas.height,
        1,
        2000,
      ),
    }),
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
      input: {
        mouse: new io.Mouse(canvas),
        keyboard: new io.Keyboard(canvas),
      },
      metrics: {
        infoHtmlElement: document.querySelector("#info")!,
        drawStartTime: 0,
        updateElapsed: 0,
      },
    },
  };
}

function update(state: State<App>): State<App> {
  const updateStart = performance.now();

  const input = state.app.input;
  const mouse = input.mouse.poll();
  if (mouse.scroll) {
    // scroll -> orbit camera
    // Shift + scroll -> pan camera
    // Alt + scroll -> rotate camera
    // Ctrl + scroll -> zoom camera
    // Meta + scroll -> zoom camera
  }

  // Get metrics.
  const updateEnd = performance.now();
  state.app.metrics.drawStartTime = updateEnd;
  state.app.metrics.updateElapsed = updateEnd - updateStart;
  return state;
}

function updateAfterDraw(state: State<App>): State<App> {
  // Display performance metrics.
  if (state.frameNumber % 10 === 0) {
    const metrics = state.app.metrics;
    const fps = 1 / state.deltaTime;
    const updateElapsed = metrics.updateElapsed;
    const drawElapsed = performance.now() - metrics.drawStartTime;
    const totalElapsed = updateElapsed + drawElapsed;
    metrics.infoHtmlElement.textContent = [
      `fps:    ${fps.toFixed(1)}`,
      `update: ${updateElapsed.toFixed(1)} ms`,
      `draw:   ${drawElapsed.toFixed(1)} ms`,
      `total:  ${totalElapsed.toFixed(1)} ms`,
    ].join("\n");
  }
  return state;
}

start({ canvas, init, update, updateAfterDraw });
