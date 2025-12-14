export async function start(canvas, app) {
    // Get the GPU device
    if (!navigator.gpu) {
        window.alert('this browser does not support WebGPU');
        return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        window.alert('this browser supports webgpu but it appears disabled');
        return;
    }
    const device = await adapter.requestDevice();
    device.lost.then((info) => {
        window.alert(`WebGPU device was lost: ${info.message}`);
        if (info.reason !== 'destroyed') {
            this.start();
        }
    });

    // Start the app
    app(device);
}
