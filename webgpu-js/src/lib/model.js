export class Model {
    constructor({ vertices, indices }) {
        this.vertices = new Float32Array(vertices.flat())
        this.indices = new Uint32Array(indices.flat())
    }
}