import { describe, it, expect } from 'vitest';
import { nodeAtPoint } from '../../src/canvas/editor/doc_ops_nodes.js';
import { buildSpatialIndex } from '../../src/canvas/editor/viewport_culling.js';
import { NODE_KIND } from '../../src/canvas/editor/scene_model.js';
const node = (id, x, extra = {}) => ({ id, kind: NODE_KIND.RECT, x, y: 0, width: 30, height: 30, visible: true, ...extra });
describe('spatial nodeAtPoint', () => {
  it('matches linear hits for 5k nodes and completes 200 queries under 100ms', () => {
    const doc = { width: 500000, height: 500, nodes: Array.from({ length: 5000 }, (_, i) => node(`${i}`, i * 80)) };
    const index = buildSpatialIndex(doc.nodes);
    const points = Array.from({ length: 200 }, (_, i) => ({ x: (i * 23 % 5000) * 80 + 10, y: 10 }));
    const expected = points.map(p => nodeAtPoint(doc, p));
    const start = performance.now();
    const actual = points.map(p => nodeAtPoint(doc, p, { spatialIndex: index }));
    expect(performance.now() - start).toBeLessThan(100);
    expect(actual).toEqual(expected);
  });
  it('preserves z order, lock, reject, groups, booleans and multiple fill instances', () => {
    const nodes = [node('base', 0), node('group', 0, { kind: NODE_KIND.GROUP, visible: false }), node('child', 0, { parentId: 'group' }), node('boolean', 0, { kind: NODE_KIND.BOOLEAN }), node('boolean-child', 0, { parentId: 'boolean' }), node('locked', 0, { locked: true }), ...['fill1', 'fill2'].map(id => node(id, 1000, { kind: NODE_KIND.CANVAS_INSTANCE, instance: { layoutMode: 'fill' } }))];
    const doc = { width: 100, height: 100, nodes };
    const spatialIndex = buildSpatialIndex(nodes);
    for (const opts of [{}, { reject: n => n.id.startsWith('fill') }, { includeLocked: true, reject: n => n.id.startsWith('fill') }]) {
      expect(nodeAtPoint(doc, { x: 10, y: 10 }, { ...opts, spatialIndex })).toBe(nodeAtPoint(doc, { x: 10, y: 10 }, opts));
    }
    const reordered = { ...doc, nodes: [...nodes].reverse() };
    expect(nodeAtPoint(reordered, { x: 10, y: 10 }, { spatialIndex })).toBe(nodeAtPoint(reordered, { x: 10, y: 10 }));
  });

  it('returns the selectable overlap stack from top to bottom and honors reject filters', () => {
    const nodes = [node('back', 0), node('middle', 0), node('top', 0)];
    const doc = { width: 100, height: 100, nodes };
    const spatialIndex = buildSpatialIndex(nodes);
    expect(nodeAtPoint(doc, { x: 10, y: 10 }, { all: true, spatialIndex }).map(item => item.id))
      .toEqual(['top', 'middle', 'back']);
    expect(nodeAtPoint(doc, { x: 10, y: 10 }, { all: true, spatialIndex, reject: item => item.id === 'top' }).map(item => item.id))
      .toEqual(['middle', 'back']);
  });
});
