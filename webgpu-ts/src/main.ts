import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import * as io from "./lib/io";
import { start, type InitState as StateInit, type State } from "./lib/start";
import type { Renderer } from "./lib/renderer";
import { Transform } from "./lib/transform";
import { load } from "./lib/load";

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

async function init(renderer: Renderer): Promise<StateInit<App>> {
  const meshes_pool_cap_mb = (
    renderer.meshes.vertices.buffer.size +
    renderer.meshes.indices.size +
    renderer.meshes.bounds.size
  ) / 1024 / 1024;
  const meshes_heap_cap_mb = renderer.meshes.geometry.buffer.size / 1024 / 1024;
  const entities_pool_cap_mb = (
    renderer.entities.local.buffer.size +
    renderer.entities.world_A.size +
    renderer.entities.world_B.size +
    renderer.entities.mesh.size +
    renderer.entities.material.size +
    renderer.entities.subscriptions.size
  ) / 1024 / 1024;
  const entities_heap_cap_mb = 0 / 1024 / 1024;
  console.log('--- Memory allocated ---');
  console.log(` meshes.pool: ${meshes_pool_cap_mb.toFixed(2)} MiB (${renderer.meshes.capacity} capacity)`);
  console.log(` meshes.heap: ${meshes_heap_cap_mb.toFixed(2)} MiB`);
  console.log(` entities.pool: ${entities_pool_cap_mb.toFixed(2)} MiB (${renderer.entities.capacity} capacity)`);
  console.log(` entities.heap: ${entities_heap_cap_mb.toFixed(2)} MiB`);

  // Check for shader compilation errors.
  // for (const [pass, { shaderModule }] of Object.entries(renderer.passes)) {
  //   const messages = await renderer.shaderCompilationMessages(shaderModule);
  //   if (messages.info.length > 0) {
  //     console.log(`--- [${pass}] info messages ---`);
  //     for (const msg of messages.info) {
  //       console.log(msg);
  //     }
  //   }
  //   if (messages.warnings.length > 0) {
  //     console.log(`--- [${pass}] warnings ---`);
  //     for (const msg of messages.info) {
  //       console.log(`⚠️ ${msg}`);
  //     }
  //   }
  //   if (messages.errors.length > 0) {
  //     console.error(`--- [${pass}] errors ---`);
  //     for (const msg of messages.errors) {
  //       console.error(msg);
  //     }
  //     throw new Error(`[${pass}] compilation errors`);
  //   }
  // }

  const scene = await load(renderer, "assets/experiment/apartment_small/scene.gltf");

  const meshes_heap_use_mb = renderer.meshes.geometry.size_used() / 1024 / 1024;
  console.log('--- Memory used ---');
  console.log(` meshes.pool: ${(renderer.meshes.entries.size / renderer.meshes.capacity * 100).toFixed(1)}% (${renderer.meshes.entries.size} count)`);
  console.log(` meshes.heap: ${(meshes_heap_use_mb / meshes_heap_cap_mb * 100).toFixed(1)}% (${meshes_heap_use_mb.toFixed(2)} MiB)`);
  console.log(` entities.pool: ${(renderer.entities.entries.size / renderer.entities.capacity * 100).toFixed(2)}% (${renderer.entities.entries.size} count)`);

  // Build/load the initial scene.
  // const entities: Record<string, Entity> = {
  //   tri1: {
  //     meshId: "triangle",
  //   },
  //   tri2: {
  //     meshId: "triangle",
  //     transform: new Transform({ position: [-1, 0, 0] }),
  //   },
  //   // camera: Entity({
  //   //   resource: Camera(),
  //   //   transform: new Transform({
  //   //     position: [0, 0, 10],
  //   //   }).cameraAim([0, 0, 0]),
  //   // }),
  //   // origin: Entity({
  //   //   resource: Reference("assets/cube.obj"),
  //   //   transform: new Transform({ scale: [0.1, 0.1, 0.1] }),
  //   // }),
  //   // triangle1: Entity({
  //   //   resource: Mesh({
  //   //     id: "triangle-mesh",
  //   //     vertices: [
  //   //       [0, 0, 0, 1, 0, 0],
  //   //       [1, 0, 0, 0, 1, 0],
  //   //       [0, 1, 0, 0, 0, 1],
  //   //     ],
  //   //     indices: [0, 1, 2],
  //   //   }),
  //   //   transform: new Transform({
  //   //     position: [1, 1, 1],
  //   //   }),
  //   // }),
  //   // triangle2: Entity({
  //   //   resource: Mesh({ id: "triangle-mesh" }),
  //   //   transform: new Transform({
  //   //     position: [-1, -1, -10],
  //   //   }),
  //   // }),
  //   // sphere: Entity({
  //   //   resource: Reference("assets/icosphere.obj"),
  //   //   transform: new Transform({
  //   //     position: [-2, 1, -3],
  //   //     scale: [0.5, 0.5, 0.5],
  //   //   }),
  //   // }),
  // };

  // const meshes = {
  //   triangle: {
  //     vertices: [
  //       [0, 0, 0, 1, 0, 0],
  //       [1, 0, 0, 0, 1, 0],
  //       [0, 1, 0, 0, 0, 1],
  //     ],
  //     lod0: [0, 1, 2],
  //   },
  // };

  // Return the initial state.
  return {
    camera: {
      transform: new Transform({ position: [0, 0, 5] }),
    },
    // scene: Object.entries(entities),
    // meshes: Object.entries(meshes),
    app: {
      cursor: vec3.create(),
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

function resize(projection: Mat4, width: number, height: number): Mat4 {
  return mat4.perspective(
    100, // fieldOfView
    width / height, // aspect
    1, // zNear
    1000, // zFar
    projection, // dst
  );
}

function update(state: State<App>): State<App> {
  const updateStart = performance.now();

  const renderer = state.renderer;
  const camera = renderer.camera;

  const input = state.app.input;
  const mouse = input.mouse.poll();
  const keyboard = input.keyboard.poll();
  if (mouse.scroll) {
    if (keyboard.shift.held) {
      // Shift + scroll -> pan camera
      const speed = 0.5 * state.deltaTime;
      const delta = [-mouse.scroll.x * speed, mouse.scroll.y * speed, 0];
      camera.transform.translate(delta);
      renderer.updateCameraViewProjection();
    } else if (keyboard.ctrl.held || keyboard.meta.held) {
      // Ctrl/Meta + scroll -> zoom camera
      const speed = 1.5 * state.deltaTime;
      const delta = [0, 0, (mouse.scroll.y - mouse.scroll.x) * speed];
      camera.transform.translate(delta);
      renderer.updateCameraViewProjection();
    } else if (keyboard.alt.held) {
      // Alt + scroll -> rotate camera
      const speed = 0.2 * state.deltaTime;
      camera.transform
        .yaw(-mouse.scroll.x * speed)
        .pitch(-mouse.scroll.y * speed)
        .alignUp();
      renderer.updateCameraViewProjection();
    } else {
      // scroll -> orbit camera
      const speed = 0.5 * state.deltaTime;
      const pivot = state.app.cursor;
      camera.transform
        .orbit(pivot, -mouse.scroll.x * speed, -mouse.scroll.y * speed)
        .alignUp();
      renderer.updateCameraViewProjection();
    }
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

start({ canvas, init, update, updateAfterDraw, resize });
