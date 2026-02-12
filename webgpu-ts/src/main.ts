import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import * as io from "./lib/io";
import { start, type InitState as StateInit, type State } from "./lib/start";
import { Stage } from "./lib/stage";
import { Transform } from "./lib/transform";
import { load } from "./lib/load";
import type { Renderer } from "./lib/renderer";
import { findEntity } from "./lib/scene";
import type { EntityId } from "./lib/entities";
import { UINT32_MAX } from "./lib/stdlib";

const canvas: HTMLCanvasElement = document.querySelector("#canvas")!;

interface App {
  cursor: Vec3;
  camera: EntityId;
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

async function init(device: GPUDevice): Promise<StateInit<App>> {
  console.log(device.limits);
  const stage = new Stage(device);

  const meshes_pool_cap_mb = (
    stage.meshes.base_vertex.buffer.size +
    stage.meshes.lods.size +
    stage.meshes.bounds.size
  ) / 1024 / 1024;
  const meshes_heap_cap_mb = stage.meshes.geometry.buffer.size / 1024 / 1024;
  const entities_pool_cap_mb = (
    stage.entities.local.buffer.size +
    stage.entities.world_A.size +
    stage.entities.world_B.size +
    stage.entities.mesh.size +
    stage.entities.material.size +
    stage.entities.subscriptions.size
  ) / 1024 / 1024;
  const entities_heap_cap_mb = 0 / 1024 / 1024;
  const allocated_total_mb = (
    meshes_pool_cap_mb + meshes_heap_cap_mb +
    entities_pool_cap_mb + entities_heap_cap_mb
  );
  console.log(`--- Memory allocated (${allocated_total_mb.toFixed(2)} MiB) ---`);
  console.log(` meshes.pool: ${meshes_pool_cap_mb.toFixed(2)} MiB (${stage.meshes.capacity} capacity)`);
  console.log(` meshes.heap: ${meshes_heap_cap_mb.toFixed(2)} MiB`);
  console.log(` entities.pool: ${entities_pool_cap_mb.toFixed(2)} MiB (${stage.entities.capacity} capacity)`);
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

  const scene = await load("assets/experiment/apartment_small/scene.gltf");
  stage.load(scene);

  const camera = stage.find("skp_camera_Last_Saved_SketchUp_View");
  stage.viewports.set(camera?.id ?? UINT32_MAX, {
    width: canvas.width,
    height: canvas.height,
  });

  // TODO: do not load geometry here, stream as needed by cpu_feedback
  for (const name of stage.meshes.entries.keys()) {
    await stage.meshes.loadGeometry(name);
  }

  const meshes_heap_use_mb = stage.meshes.geometry.size_used() / 1024 / 1024;
  const entities_heap_use_mb = 0 / 1024 / 1024;
  console.log('--- Memory used ---');
  console.log(` meshes.pool: ${(stage.meshes.entries.size / stage.meshes.capacity * 100).toFixed(1)}% (${stage.meshes.entries.size} count)`);
  console.log(` meshes.heap: ${(meshes_heap_use_mb / meshes_heap_cap_mb * 100).toFixed(1)}% (${meshes_heap_use_mb.toFixed(2)} MiB)`);
  console.log(` entities.pool: ${(stage.entities.entries.size / stage.entities.capacity * 100).toFixed(2)}% (${stage.entities.entries.size} count)`);
  console.log(` entities.heap: ${(entities_heap_use_mb / entities_heap_cap_mb * 100).toFixed(1)}% (${entities_heap_use_mb.toFixed(2)} MiB)`);

  // Return the initial state.
  return {
    stage,
    app: {
      cursor: vec3.create(),
      camera: camera?.id ?? UINT32_MAX,
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

// function resize(app: App, width: number, height: number): App {
//   // return mat4.perspective(
//   //   100, // fieldOfView
//   //   width / height, // aspect
//   //   1, // zNear
//   //   1000, // zFar
//   //   projection, // dst
//   // );
//   return { ...app, canvas: { width, height } };
// }

function update(state: State<App>): State<App> {
  const updateStart = performance.now();

  const { renderer, stage, app } = state;
  const camera = renderer.camera;

  const input = app.input;
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
      const pivot = app.cursor;
      camera.transform
        .orbit(pivot, -mouse.scroll.x * speed, -mouse.scroll.y * speed)
        .alignUp();
    }
  }

  // Get metrics.
  const updateEnd = performance.now();
  app.metrics.drawStartTime = updateEnd;
  app.metrics.updateElapsed = updateEnd - updateStart;

  renderer.draw(state);

  // Display performance metrics.
  if (state.frameNumber % 10 === 0) {
    const metrics = app.metrics;
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

start({ canvas, init, update });
