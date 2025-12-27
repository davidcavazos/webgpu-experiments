import { mat4, vec3, type Vec3 } from "wgpu-matrix";
import { Engine } from "./lib/engine";
import * as io from "./lib/io";
import { Scene } from "./lib/scene";
import { start, type InitState as StateInit, type State } from "./lib/start";
import { Camera, Mesh } from "./lib/content";
import { getPosition, setPosition } from "./lib/entity";
import { utils } from "wgpu-matrix";
import { clamp } from "./lib/stdlib";

const MAX_PITCH = utils.degToRad(89.5);
const TWO_PI = 2 * Math.PI;

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
    // camera: {
    //   content: Camera(),
    //   transform: mat4.identity(),
    //   entities: {},
    // },
    triangle1: {
      content: Mesh({
        id: "triangle-mesh",
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        indices: [0, 1, 2],
      }),
      // transform: mat4.translation([0, 0, -4]),
      matrix: mat4.identity(),
      entities: {},
    },
    triangle2: {
      content: Mesh({ id: "triangle-mesh" }),
      matrix: mat4.scale(mat4.translation([-0.5, -1, -4]), [0.5, 0.5, 0.5]),
      entities: {},
    },
    // pyramid1: ref({ filename: "assets/pyramid.obj" }),
  });

  // Return the initial state.
  return {
    scene,
    app: {
      cursor: vec3.create(0, 1, 0),
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
    2000, // zFar
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
      const delta = [mouse.scroll.x * speed, -mouse.scroll.y * speed, 0];
      camera.matrix = mat4.translate(camera.matrix, delta);
    } else if (keyboard.ctrl.held || keyboard.meta.held) {
      // Ctrl + scroll -> zoom camera
      // Meta + scroll -> zoom camera
      const speed = 1.5 * state.deltaTime;
      const delta = [0, 0, (mouse.scroll.x - mouse.scroll.y) * speed];
      camera.matrix = mat4.translate(camera.matrix, delta);
    } else if (keyboard.alt.held) {
      // Alt + scroll -> rotate camera
      const speed = 0.5 * state.deltaTime;
      const position = getPosition(camera.matrix);
      // const radius = vec3.len(position);
      camera.content.yaw =
        (camera.content.yaw + mouse.scroll.x * speed) % TWO_PI;
      camera.content.pitch = clamp(
        camera.content.pitch + mouse.scroll.y * speed,
        MAX_PITCH,
        -MAX_PITCH,
      );
      let matrix = mat4.identity();
      matrix = mat4.translate(matrix, position);
      matrix = mat4.rotateX(matrix, camera.content.pitch);
      matrix = mat4.rotateY(matrix, camera.content.yaw);
      // camera.matrix = mat4.translate(camera.matrix, [0, 0, -radius]);
      camera.matrix = matrix;
    } else {
      // scroll -> orbit camera
      const speed = 0.5 * state.deltaTime;
      const position = getPosition(camera.matrix);
      const pivot = state.app.cursor;
      // const radius = vec3.distance(position, pivot);
      const radius = 10; // TODO: remove this, calculate actual distance
      // TODO: calculate offset from dot product of camera direction and pivot
      // - Note that camera position should be the origin
      // - What should be the length of the camera direction? radius?
      // const offset = vec3.subtract(position, pivot);
      camera.content.yaw =
        (camera.content.yaw + mouse.scroll.x * speed) % TWO_PI;
      camera.content.pitch = clamp(
        camera.content.pitch + mouse.scroll.y * speed,
        MAX_PITCH,
        -MAX_PITCH,
      );
      let matrix = mat4.identity();
      // matrix = mat4.translate(matrix, offset);
      matrix = mat4.translate(matrix, [0, 0, -radius]);
      matrix = mat4.rotateX(matrix, camera.content.pitch);
      matrix = mat4.rotateY(matrix, camera.content.yaw);
      matrix = mat4.translate(matrix, pivot);
      camera.matrix = matrix;
    }
  }

  mat4.multiply(
    camera.content.projection,
    camera.matrix,
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
