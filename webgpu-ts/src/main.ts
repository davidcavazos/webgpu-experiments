import { mat4 } from "wgpu-matrix";
import { Engine } from "./lib/engine";
import * as io from "./lib/io";
import { Scene } from "./lib/scene";
import { start, type InitState as StateInit, type State } from "./lib/start";
import { EntityEmpty, EntityMesh } from "./lib/entity";

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

function projection(width: number, height: number) {
  const fieldOfView = 100;
  const aspect = width / height;
  const zNear = 1;
  const zFar = 2000;
  return mat4.perspective(fieldOfView, aspect, zNear, zFar);
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
    camera: {
      content: EntityEmpty(),
      transform: mat4.translation([0, 0, 0]),
      entities: {},
    },
    triangle1: {
      content: EntityMesh({
        id: "triangle-mesh",
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        indices: [0, 1, 2],
      }),
      transform: mat4.translation([0, 0, -4]),
      entities: {},
    },
    triangle2: {
      content: EntityMesh({ id: "triangle-mesh" }),
      // transform: mat4.scale(
      //   mat4.translate(mat4.identity(), [-0.5, -1, -4]),
      //   [0.5, 0.5, 0.5],
      // ),
      transform: mat4.translation([-0.5, -1, -4]), //.scale(0.5, 0.5, 0.5),
      entities: {},
    },
    // pyramid1: ref({ filename: "assets/pyramid.obj" }),
  });

  // Return the initial state.
  return {
    scene,
    app: {
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

function update(state: State<App>): State<App> {
  const updateStart = performance.now();

  // let ref camera = state.scene.find(["camera"]) or state.default-camera
  const camera = state.scene.find(["camera"]) ?? state.defaultCamera;

  const input = state.app.input;
  const mouse = input.mouse.poll();
  const keyboard = input.keyboard.poll();
  if (mouse.scroll) {
    if (keyboard.shift.held) {
      // Shift + scroll -> pan camera
      const speed = 0.5 * state.deltaTime;
      const delta = [mouse.scroll.x * speed, -mouse.scroll.y * speed, 0];
      camera.transform = mat4.translate(camera.transform, delta);
    } else if (keyboard.alt.held) {
      // Alt + scroll -> rotate camera
      const speed = 0.2 * state.deltaTime;
      // const eye = getPosition(camera);
      // const target = mat4.translate(camera.transform, [
      //   mouse.scroll.x,
      //   mouse.scroll.y,
      //   speed,
      // ]);
      // const up = [0, 1, 0];
      // camera.transform = mat4.lookAt(eye, target, up);
      console.log("TODO: rotate");
    } else if (keyboard.ctrl.held || keyboard.meta.held) {
      // Ctrl + scroll -> zoom camera
      // Meta + scroll -> zoom camera
      const speed = 1.5 * state.deltaTime;
      const delta = [0, 0, (mouse.scroll.x - mouse.scroll.y) * speed];
      camera.transform = mat4.translate(camera.transform, delta);
    } else {
      // scroll -> orbit camera
      console.log("TODO: orbit");
    }
  }

  mat4.multiply(
    state.globals.projection,
    camera.transform,
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

start({ canvas, projection, init, update, updateAfterDraw });
