import init, { Scene } from './generated/voo_engine.js';
/** @type {Promise<import('./generated/voo_engine.js').InitOutput> | undefined} */
let ready;
/** @param {Uint8Array | undefined} [bytes] */
export async function createWasmScene(bytes) {
  const memory = await (ready ??= init(bytes ? { module_or_path: bytes } : {}));
  const scene = new Scene();
  return {
    /** @param {Float32Array} ops */
    apply(ops) {
      if (ops.length % 7) throw new Error('Expected seven float32 values per operation');
      const ptr = scene.reserve_ops(ops.length / 7);
      // Always reacquire after allocating: WASM memory growth detaches old views.
      new Float32Array(memory.memory.buffer, ptr, ops.length).set(ops);
      scene.apply(ops.length / 7);
    },
    /** @param {number} x @param {number} y @param {number} r @param {number} b */
    query(x, y, r, b) {
      const count = scene.query(x, y, r, b);
      return new Uint32Array(memory.memory.buffer, scene.output_ptr(), count).slice();
    },
    /** @param {number} x @param {number} y */
    hitTest: (x, y) => scene.hit_test(x, y),
    /** @param {number} x @param {number} y @param {number} r @param {number} b */
    drawList(x, y, r, b) {
      const count = scene.draw_list(x, y, r, b);
      return {
        ids: new Uint32Array(memory.memory.buffer, scene.output_ptr(), count).slice(),
        transforms: new Float32Array(memory.memory.buffer, scene.transforms_ptr(), count * 6).slice(),
      };
    },
    /** @param {number} bucket */
    setTileBucket: bucket => scene.tile_bucket(bucket),
    takeTiles: () => scene.take_tiles(),
    takeDirty: () => scene.take_dirty(),
    free: () => scene.free(),
  };
}
