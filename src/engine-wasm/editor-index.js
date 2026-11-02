import { trackNodes, changesSince } from './journal.js';
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
    let changes = this.nodes && changesSince(this.nodes, nodes);
    if (!changes) {
      // Document replacement (including undo): derive a journal once, never on camera frames.
      const seen = new Set(nodes.map(n => n.id));
      changes = nodes.map((node, z) => ({ node, z }));
      for (const id of this.entries.keys()) if (!seen.has(id)) changes.push({ id, remove: true });
    }
    this.applyJournal(changes);
    trackNodes(nodes);
    this.nodes = nodes;
    return this;
  }
  applyJournal(changes) {
    const ops = [];
    for (const change of changes) {
      const { node, z, remove } = change;
      const id = change.id ?? node.id;
      const old = this.entries.get(id);
      if (remove) {
        if (old) {
          ops.push(0, old.slot, 0, 0, 0, 0, 0);
          this.items[old.slot] = null; this.freeSlots.push(old.slot); this.entries.delete(id);
        }
        continue;
      }
      if (old?.node === node && old.z === z) continue;
      const slot = old?.slot ?? this.freeSlots.pop() ?? this.next++;
      const previous = this.items[slot];
      // Pure position edits use native translation; all geometry/style edits upsert.
      const translated = old && old.z === z && Object.keys(node).length === Object.keys(old.node).length &&
        Object.keys(node).every(k => k === 'x' || k === 'y' || node[k] === old.node[k]);
      let item;
      if (translated) {
        const dx = (node.x ?? 0) - (old.node.x ?? 0), dy = (node.y ?? 0) - (old.node.y ?? 0);
        ops.push(2, slot, dx, dy, 0, 0, 0);
        item = { ...previous, node, minX: previous.minX + dx, minY: previous.minY + dy,
          maxX: previous.maxX + dx, maxY: previous.maxY + dy };
      } else {
        const b = nodeVisualAABB(node);
        const lower = v => Math.fround(v) - Math.max(1e-5, Math.abs(v) * 1.2e-7);
        const upper = v => Math.fround(v) + Math.max(1e-5, Math.abs(v) * 1.2e-7);
        item = { id, node, drawNode: node, minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height };
        ops.push(1, slot, lower(item.minX), lower(item.minY), upper(item.maxX), upper(item.maxY), z);
      }
      this.items[slot] = item;
      this.entries.set(id, { node, z, slot });
    }
    if (ops.length) this.scene.apply(Float32Array.from(ops));
    return this;
  }
  drawList(box) { return this.scene.drawList(box.minX, box.minY, box.maxX, box.maxY); }
  // Provider contract shared by SkPicture and the parallel stage raster cache.
  takeDirtyTiles(zoom = 1) {
    const bucket = Math.max(-8, Math.min(8, Math.round(Math.log2(zoom || 1))));
    this.scene.setTileBucket(bucket);
    const packed = this.scene.takeTiles();
    return { bucket, size: 512 / 2 ** bucket, reset: !!packed[0], keys: packed.slice(1) };
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
