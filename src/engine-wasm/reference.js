// Independent linear reference. Every wire value is explicitly float32.
export class ReferenceScene {
  /** @type {Map<number, number[]>} */
  rows = new Map();
  /** @type {number[] | null} */
  dirty = null;
  /** @param {Float32Array} ops */
  apply(ops) {
    for (let p = 0; p < ops.length; p += 7) {
      const [op, id, ...row] = Array.from(ops.slice(p, p + 7), Math.fround);
      const old = this.rows.get(id);
      if (old) this.mark(old);
      if (op === 2) {
        if (!old) continue;
        const moved = [Math.fround(old[0] + row[0]), Math.fround(old[1] + row[1]),
          Math.fround(old[2] + row[0]), Math.fround(old[3] + row[1]), old[4]];
        this.rows.set(id, moved); this.mark(moved);
      }
      else if (op) { this.rows.set(id, row); this.mark(row); }
      else this.rows.delete(id);
    }
  }
  /** @param {number[]} b */
  mark(b) {
    const d = this.dirty;
    this.dirty = d ? [Math.min(d[0], b[0]), Math.min(d[1], b[1]), Math.max(d[2], b[2]), Math.max(d[3], b[3])] : b.slice(0, 4);
  }
  /** @param {number} x @param {number} y @param {number} r @param {number} b */
  query(x, y, r, b) {
    [x, y, r, b] = [x, y, r, b].map(Math.fround);
    return Uint32Array.from([...this.rows].filter(([, v]) => v[0] <= r && v[2] >= x && v[1] <= b && v[3] >= y).sort((a, b) => a[1][4] - b[1][4] || a[0] - b[0]).map(([id]) => id));
  }
  /** @param {number} x @param {number} y */
  hitTest(x, y) { return this.query(x, y, x, y).at(-1) ?? -1; }
  takeDirty() { const d = this.dirty; this.dirty = null; return d ? Float32Array.from(d) : new Float32Array(); }
  free() { this.rows.clear(); }
}
