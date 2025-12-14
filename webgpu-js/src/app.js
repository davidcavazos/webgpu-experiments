import { cube } from "./cube.js";
import { start } from "./lib/renderer.js";
import { mat4 } from "./lib/transform.js";

const canvas = document.querySelector('#canvas');
const info = document.querySelector('#info')
start(canvas, device => {
    const context = canvas.getContext('webgpu');
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
    });

    const module = device.createShaderModule({
        code: /* wgsl */ `
      struct Uniforms {
        color: vec4f,
        matrix: mat4x4f,
      };

      struct Vertex {
        @location(0) position: vec4f,
      };

      struct VSOutput {
        @builtin(position) position: vec4f,
      };

      @group(0) @binding(0) var<uniform> uni: Uniforms;

      @vertex fn vs(vert: Vertex) -> VSOutput {
        var vsOut: VSOutput;
        vsOut.position = uni.matrix * vert.position;
        return vsOut;
      }

      @fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
        return uni.color;
      }
    `,
    });

    const pipeline = device.createRenderPipeline({
        label: 'just 2d position',
        layout: 'auto',
        vertex: {
            module,
            buffers: [
                {
                    arrayStride: (3) * 4, // (3) floats, 4 bytes each
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
                    ],
                },
            ],
        },
        fragment: {
            module,
            targets: [{ format: presentationFormat }],
        },
        primitive: {
            cullMode: 'back',
        },
    });

    // color, matrix
    const uniformBufferSize = (4 + 16) * 4;
    const uniformBuffer = device.createBuffer({
        label: 'uniforms',
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniformValues = new Float32Array(uniformBufferSize / 4);

    // offsets to the various uniform values in float32 indices
    const kColorOffset = 0;
    const kMatrixOffset = 4;

    const colorValue = uniformValues.subarray(kColorOffset, kColorOffset + 4);
    const matrixValue = uniformValues.subarray(kMatrixOffset, kMatrixOffset + 16);

    // The color will not change so let's set it once at init time
    colorValue.set([Math.random(), Math.random(), Math.random(), 1]);

    const vertexData = cube.vertices
    const indexData = cube.indices
    const numVertices = cube.indices.length
    const vertexBuffer = device.createBuffer({
        label: 'vertex buffer vertices',
        size: vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);
    const indexBuffer = device.createBuffer({
        label: 'index buffer',
        size: indexData.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, 0, indexData);

    const bindGroup = device.createBindGroup({
        label: 'bind group for object',
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
        ],
    });

    const renderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [
            {
                // view: <- to be filled out when we render
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
    };

    let lastRenderTime = 0;
    function render(now) {
        const startTime = performance.now()

        // Get the current texture from the canvas context and
        // set it as the texture to render to.
        renderPassDescriptor.colorAttachments[0].view
            = context.getCurrentTexture().createView();


        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, vertexBuffer);
        pass.setIndexBuffer(indexBuffer, 'uint32');

        const settings = {
            translation: [500, 500, 0],
            rotation: [40, 25, 325],
            scale: [100, 100, 100],
        }

        mat4.projection(canvas.clientWidth, canvas.clientHeight, 400, matrixValue);
        mat4.translate(matrixValue, settings.translation, matrixValue);
        mat4.rotateX(matrixValue, settings.rotation[0], matrixValue);
        mat4.rotateY(matrixValue, settings.rotation[1], matrixValue);
        mat4.rotateZ(matrixValue, settings.rotation[2], matrixValue);
        mat4.scale(matrixValue, settings.scale, matrixValue);

        // upload the uniform values to the uniform buffer
        device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

        pass.setBindGroup(0, bindGroup);
        pass.drawIndexed(numVertices);

        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);

        // Performance metrics
        if (Math.floor(now * 0.02) !== Math.floor(lastRenderTime * 0.02)) {
            const elapsed = performance.now() - startTime
            const fps = 1000 / (now - lastRenderTime)
            info.textContent = [
                `fps:  ${fps.toFixed(1)}`,
                `time: ${elapsed.toFixed(1)} ms`,
            ].join('\n')
        }
        lastRenderTime = now
        // requestAnimationFrame(render)
    }

    requestAnimationFrame(render)

    // https://webgpufundamentals.org/webgpu/lessons/webgpu-resizing-the-canvas.html
    const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            const width = entry.devicePixelContentBoxSize?.[0].inlineSize ||
                entry.contentBoxSize[0].inlineSize * devicePixelRatio;
            const height = entry.devicePixelContentBoxSize?.[0].blockSize ||
                entry.contentBoxSize[0].blockSize * devicePixelRatio;
            const canvas = entry.target;
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
            render()
        }
    });
    try {
        observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
        observer.observe(canvas, { box: 'content-box' });
    }
})