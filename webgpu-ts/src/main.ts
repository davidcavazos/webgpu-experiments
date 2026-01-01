import { mat4, vec3, type Vec3 } from "wgpu-matrix";
import { Engine } from "./lib/engine";
import * as io from "./lib/io";
import { Scene } from "./lib/scene";
import { start, type InitState as StateInit, type State } from "./lib/start";
import { Camera, Mesh, Reference } from "./lib/content";
import { Transform } from "./lib/transform";
import { Entity } from "./lib/entity";

const canvas: HTMLCanvasElement = document.querySelector("#canvas")!;

interface App {
  cursor: Vec3;
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
  console.log(engine.device.limits);

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
  const scene = new Scene({
    camera: Entity({
      content: Camera(),
      transform: new Transform({
        position: [0, 0, 10],
      }).cameraAim([0, 0, 0]),
    }),
    triangle1: Entity({
      content: Mesh({
        id: "triangle-mesh",
        vertices: [
          [0, 0, 0, 1, 0, 0],
          [1, 0, 0, 0, 1, 0],
          [0, 1, 0, 0, 0, 1],
        ],
        indices: [0, 1, 2],
      }),
      transform: new Transform({
        position: [1, 1, 1],
      }),
    }),
    triangle2: Entity({
      content: Mesh({ id: "triangle-mesh" }),
      transform: new Transform({
        position: [-1, -1, -10],
      }),
    }),
    origin: Entity({
      content: Reference("assets/cube.obj"),
      transform: new Transform({ scale: [0.1, 0.1, 0.1] }),
    }),
  });

  // Return the initial state.
  return {
    scene,
    app: {
      cursor: vec3.create(0, 0, 0),
      input: {
        mouse: new io.Mouse(),
        keyboard: new io.Keyboard(),
      },
      metrics: {
        infoHtmlElement: document.querySelector("#info")!,
        drawStartTime: 0,
        updateElapsed: 0,
      },
    },
  };
}

function resize(state: State<App>, width: number, height: number): State<App> {
  const { camera } = state.scene.findCamera(["camera"]);
  camera.content.projection = mat4.perspective(
    100, // fieldOfView
    width / height, // aspect
    1, // zNear
    1000, // zFar
  );
  return state;
}

function update(state: State<App>): State<App> {
  const updateStart = performance.now();

  const { camera } = state.scene.findCamera(["camera"]);

  const input = state.app.input;
  const mouse = input.mouse.poll();
  const keyboard = input.keyboard.poll();
  if (mouse.scroll) {
    if (keyboard.shift.held) {
      // Shift + scroll -> pan camera
      const speed = 0.5 * state.deltaTime;
      const delta = [-mouse.scroll.x * speed, mouse.scroll.y * speed, 0];
      camera.transform.translate(delta);
    } else if (keyboard.ctrl.held || keyboard.meta.held) {
      // Ctrl/Meta + scroll -> zoom camera
      const speed = 1.5 * state.deltaTime;
      const delta = [0, 0, (mouse.scroll.y - mouse.scroll.x) * speed];
      camera.transform.translate(delta);
    } else if (keyboard.alt.held) {
      // Alt + scroll -> rotate camera
      const speed = 0.2 * state.deltaTime;
      camera.transform
        .yaw(-mouse.scroll.x * speed)
        .pitch(-mouse.scroll.y * speed)
        .alignUp();
    } else {
      // scroll -> orbit camera
      const speed = 0.5 * state.deltaTime;
      const pivot = state.app.cursor;
      camera.transform
        .orbit(pivot, -mouse.scroll.x * speed, -mouse.scroll.y * speed)
        .alignUp();
    }
  }

  mat4.multiply(
    camera.content.projection,
    mat4.inverse(camera.transform.matrix),
    state.globals.viewProjection,
  );

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

start({ canvas, init, update, updateAfterDraw, resize });
