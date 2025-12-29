import { mat4, quat, vec3, type Vec3 } from "wgpu-matrix";
import { Engine } from "./lib/engine";
import * as io from "./lib/io";
import { Scene } from "./lib/scene";
import { start, type InitState as StateInit, type State } from "./lib/start";
import { Camera, Mesh } from "./lib/content";
import { utils } from "wgpu-matrix";
import { clamp } from "./lib/stdlib";
import { Transform, vec3YawPitch } from "./lib/transform";
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
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
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
      content: Mesh({ id: "triangle-mesh" }),
      transform: new Transform({
        scale: [0.1, 0.1, 0.1],
      }),
    }),
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

  const dx = -0.1; // ~11°
  const dy = 0.0;
  // const pivot = state.app.cursor;
  console.log("=== camera ===");
  camera.transform.yaw(-0.2); //.pitch(0.2);
  const position = camera.transform.getPosition();
  const yaw = camera.transform.getYaw();
  const pitch = camera.transform.getPitch();
  console.log("position", [...position]);
  console.log("yaw", yaw.toFixed(2));
  console.log("pitch", pitch.toFixed(2));
  console.log("=== vars ===");
  const pivot = [1, 0, 0];
  const pivotDirection = vec3.sub(pivot, camera.transform.getPosition());
  const pivotAngle = vec3YawPitch(pivotDirection);
  const radius = vec3.len(pivotDirection);
  const forward = vec3.negate(camera.transform.forward());
  const forwardAngle = vec3YawPitch(forward);
  const localAngle = {
    yaw: forwardAngle.yaw - pivotAngle.yaw,
    pitch: forwardAngle.pitch - pivotAngle.pitch,
  };
  console.log("pivot", [...pivot]);
  console.log("pivotDirection", [...pivotDirection], vec3.len(pivotDirection));
  console.log("pivotAngle", pivotAngle);
  console.log("radius", radius.toFixed(2));
  console.log("forward", [...forward]);
  console.log("forwardAngle", forwardAngle);
  console.log("localAngle", localAngle);
  // console.log("=== orbit before ===");
  // const orbitBefore = new Transform() //
  //   .translate([0, 0, radius]);
  console.log("=== orbit after ===");
  const orbitAfter = new Transform() //
    .setPosition(position)
    .yaw(yaw + dx);
  console.log("position", [...orbitAfter.getPosition()]);
  console.log("yaw", orbitAfter.getYaw());
  console.log("pitch", orbitAfter.getPitch());

  // camera.transform = orbitAfter;

  return state;
}

function update(state: State<App>): State<App> {
  const updateStart = performance.now();

  const { camera } = state.scene.findCamera(["camera"]);

  const input = state.app.input;
  const mouse = input.mouse.poll();
  const keyboard = input.keyboard.poll();
  if (mouse.scroll) {
    console.log("---");
    console.log([...camera.transform.matrix].slice(0, 4));
    console.log([...camera.transform.matrix].slice(4, 8));
    console.log([...camera.transform.matrix].slice(8, 12));
    console.log([...camera.transform.matrix].slice(12, 16));
    if (keyboard.shift.held) {
      // Shift + scroll -> pan camera
      const speed = 0.5 * state.deltaTime;
      const delta = [-mouse.scroll.x * speed, mouse.scroll.y * speed, 0];
      camera.transform.translate(delta);
    } else if (keyboard.ctrl.held || keyboard.meta.held) {
      // Ctrl + scroll -> zoom camera
      // Meta + scroll -> zoom camera
      const speed = 1.5 * state.deltaTime;
      const delta = [0, 0, (mouse.scroll.y - mouse.scroll.x) * speed];
      camera.transform.translate(delta);
    } else if (keyboard.alt.held) {
      // Alt + scroll -> rotate camera
      const speed = 0.2 * state.deltaTime;
      camera.transform = new Transform()
        .translate(camera.transform.getPosition())
        .yaw(camera.transform.getYaw() - mouse.scroll.x * speed)
        .pitch(camera.transform.getPitch() - mouse.scroll.y * speed)
        .roll(camera.transform.getRoll());
    } else {
      // scroll -> orbit camera
      const speed = 0.5 * state.deltaTime;
      const pivot = state.app.cursor;
      const direction = vec3.sub(camera.transform.getPosition(), pivot);
      // const radius = vec3.len(direction);
      const angleOffset = vec3YawPitch(direction);
      console.log("direction", direction);
      console.log("angleOffset", angleOffset);
      // const orbit = new Transform()
      //   .translate(pivot)
      //   .yaw(camera.transform.getYaw() - mouse.scroll.x * speed)
      //   .pitch(camera.transform.getPitch() - mouse.scroll.y * speed);

      // camera.transform = new Transform()
      //   .translate(pivot)
      //   .yaw(camera.transform.getYaw() - mouse.scroll.x * speed)
      //   .pitch(camera.transform.getPitch() - mouse.scroll.y * speed)
      //   .translate([0, 0, radius]);

      // const position = getPosition(camera.matrix);
      // const pivot = state.app.cursor;
      // // const radius = vec3.distance(position, pivot);
      // const radius = 10; // TODO: remove this, calculate actual distance
      // // TODO: calculate offset from dot product of camera direction and pivot
      // // - Note that camera position should be the origin
      // // - What should be the length of the camera direction? radius?
      // // const offset = vec3.subtract(position, pivot);
      // camera.content.yaw =
      //   (camera.content.yaw + mouse.scroll.x * speed) % TWO_PI;
      // camera.content.pitch = clamp(
      //   camera.content.pitch + mouse.scroll.y * speed,
      //   MAX_PITCH,
      //   -MAX_PITCH,
      // );
      // let matrix = mat4.identity();
      // // matrix = mat4.translate(matrix, offset);
      // matrix = mat4.translate(matrix, [0, 0, -radius]);
      // matrix = mat4.rotateX(matrix, camera.content.pitch);
      // matrix = mat4.rotateY(matrix, camera.content.yaw);
      // matrix = mat4.translate(matrix, pivot);
      // camera.matrix = matrix;
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
