import { describe, it, expect } from 'vitest';
import { createPointerHitTester } from '../../src/canvas/editor/editor_pointer_hit_test.js';
import { buildSpatialIndex } from '../../src/canvas/editor/viewport_culling.js';
import { NODE_KIND } from '../../src/canvas/editor/scene_model.js';
const image = (id, extra = {}) => ({ id, kind: NODE_KIND.IMAGE, x: 0, y: 0, width: 100, height: 100, visible: true, ...extra });
function tester(index) {
  return createPointerHitTester({ api: { getSpatialIndex: () => index, getViewport: () => ({ zoom: 1 }), isPaintOpaqueAt: node => node.id !== 'transparent' }, screenPoint: p => p });
}
describe('spatial imageAt', () => {
  it('matches linear bounds, z order, visibility, pixel locks and paint alpha', () => {
    const doc = { nodes: [image('base'), image('rotated', { rotation: 45 }), image('transparent', { paint: true }), image('hidden', { visible: false }), image('locked', { locked: true }), image('pixelLocked', { lockImagePixels: true })] };
    const spatial = tester(buildSpatialIndex(doc.nodes));
    for (const point of [{ x: 50, y: 50 }, { x: 500, y: 500 }, { x: 0, y: 0 }]) expect(spatial.imageAt(doc, point)).toBe(tester(null).imageAt(doc, point));
    const reversed = { nodes: [...doc.nodes].reverse() };
    expect(spatial.imageAt(reversed, { x: 50, y: 50 })).toBe(reversed.nodes.at(-1));
  });
  it('does not scan the node array after warming the order cache', () => {
    const nodes = Array.from({ length: 5000 }, (_, i) => image(`${i}`, { x: i * 200 }));
    const doc = { nodes };
    const spatial = tester(buildSpatialIndex(nodes));
    spatial.imageAt(doc, { x: 1, y: 1 });
    nodes.forEach = () => { throw new Error('unexpected full scan'); };
    expect(spatial.imageAt(doc, { x: 400001, y: 1 })).toBe(nodes[2000]);
  });
});
