import { nodeVisualAABB } from '../canvas/editor/viewport_culling.js';
export function wasmEngineEnabled() {
  try { return globalThis.localStorage?.getItem('voo.wasm-engine') === '1'; }
  catch { return false; }
}
// No WASM or generated glue is loaded on the default path.
export function loadEditorWasmIndex() {
  return import('./wasm.js').then(async ({ createWasmScene }) => new EditorWasmIndex(await createWasmScene()));
}
export class EditorWasmIndex {
  constructor(scene) { this.scene = scene; this.entries = new Map(); this.items = []; this.next = 0; this.freeSlots = []; }
  sync(nodes) {
    if (this.nodes === nodes) return this;
    const seen = new Set();
    const ops = [];
    nodes.forEach((node, z) => {
      seen.add(node.id);
      const old = this.entries.get(node.id);
      if (old?.node === node && old.z === z) return;
      const slot = old?.slot ?? this.freeSlots.pop() ?? this.next++;
      const b = nodeVisualAABB(node);
      // Outward rounding avoids losing boundary candidates through float32 conversion.
      const lower = v => Math.fround(v) - Math.max(1e-5, Math.abs(v) * 1.2e-7);
      const upper = v => Math.fround(v) + Math.max(1e-5, Math.abs(v) * 1.2e-7);
      const item = { id: node.id, node, minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height };
      ops.push(1, slot, lower(item.minX), lower(item.minY), upper(item.maxX), upper(item.maxY), z);
      this.items[slot] = item;
      this.entries.set(node.id, { node, z, slot });
    });
    for (const [id, entry] of this.entries) {
      if (!seen.has(id)) { ops.push(0, entry.slot, 0, 0, 0, 0, 0); this.items[entry.slot] = null; this.freeSlots.push(entry.slot); this.entries.delete(id); }
    }
    if (ops.length) this.scene.apply(Float32Array.from(ops));
    this.scene.takeDirty(); // Renderer dirty tracking stays authoritative during this pilot.
    this.nodes = nodes;
    return this;
  }
  search(box) {
    const minX = Number.isFinite(box.minX) ? box.minX : -Infinity;
    const minY = Number.isFinite(box.minY) ? box.minY : -Infinity;
    const maxX = Number.isFinite(box.maxX) ? box.maxX : Infinity;
    const maxY = Number.isFinite(box.maxY) ? box.maxY : Infinity;
    const x = Math.min(minX, maxX), y = Math.min(minY, maxY), r = Math.max(minX, maxX), b = Math.max(minY, maxY);
    return Array.from(this.scene.query(x, y, r, b), i => this.items[i]).filter(v => v && v.minX <= r && v.maxX >= x && v.minY <= b && v.maxY >= y);
  }
  pointQuery(p, tolerance = 0) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
    const t = Math.max(0, tolerance);
    return this.search({ minX: p.x - t, minY: p.y - t, maxX: p.x + t, maxY: p.y + t });
  }
  free() { this.scene.free(); }
}
