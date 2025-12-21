import { Engine, start, type State } from "./lib/engine";
import * as io from "./lib/io";
import { mat4 } from "./lib/mat4";
import { mesh } from "./lib/scene";

const canvas: HTMLCanvasElement = document.querySelector("#canvas")!;
interface App {
  input: {
    mouse: io.Mouse;
  };
  metrics: {
    infoHtmlElement: Element;
    lastNow: number;
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
      input: {
        mouse: new io.Mouse(canvas),
      },
      metrics: {
        infoHtmlElement: document.querySelector("#info")!,
        lastNow: 0,
        startTime: 0,
      },
    },
  };
}

function update(state: State<App>, now: number): State<App> {
  state.app.metrics.startTime = performance.now();

  const input = state.app.input;
  const mouse = input.mouse.poll();
  if (mouse.scroll) {
    console.log(mouse.scroll.x, mouse.scroll.y);
  }
  return state;
}

function updateAfterDraw(state: State<App>, now: number): State<App> {
  // Display performance metrics.
  const metrics = state.app.metrics;
  if (Math.floor(now * 0.02) !== Math.floor(metrics.lastNow * 0.02)) {
    const elapsed = performance.now() - metrics.startTime;
    const fps = 1000 / (now - metrics.lastNow);
    metrics.infoHtmlElement.textContent = [
      `fps:  ${fps.toFixed(1)}`,
      `time: ${elapsed.toFixed(1)} ms`,
    ].join("\n");
  }
  state.app.metrics.lastNow = now;
  return state;
}

start({ canvas, init, update, updateAfterDraw });
