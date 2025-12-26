import { mat4 } from "wgpu-matrix";
import { Engine } from "./lib/engine";
import * as io from "./lib/io";
import { Scene } from "./lib/scene";
import { start, type InitState as StateInit, type State } from "./lib/start";

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
      asset: { tag: "Node" },
      transform: mat4.translation([0, 0, 0]),
      entities: {},
    },
    triangle1: {
      asset: {
        tag: "MeshDescriptor",
        id: "triangle-mesh",
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        indices: [0, 1, 2],
      },
      transform: mat4.translation([0, 0, -4]),
      entities: {},
    },
    triangle2: {
      asset: {
        tag: "MeshDescriptor",
        id: "triangle-mesh",
        vertices: [],
        indices: [],
      },
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
      camera.transform = mat4.translate(camera.transform, [
        mouse.scroll.x * speed,
        -mouse.scroll.y * speed,
        0,
      ]);
    } else if (keyboard.alt.held) {
      // Alt + scroll -> rotate camera
      const speed = 0.2 * state.deltaTime;
      // mat4.rotateZ(view, mouse.scroll.z * speed, view);
      // camera.transform = camera.transform.rotate(
      //   mouse.scroll.x * speed,
      //   mouse.scroll.y * speed,
      //   0,
      // );
      console.log("TODO: rotate");
    } else if (keyboard.ctrl.held || keyboard.meta.held) {
      // Ctrl + scroll -> zoom camera
      // Meta + scroll -> zoom camera
      const speed = 1.5 * state.deltaTime;
      camera.transform = mat4.translate(camera.transform, [
        0,
        0,
        (mouse.scroll.x - mouse.scroll.y) * speed,
      ]);
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
