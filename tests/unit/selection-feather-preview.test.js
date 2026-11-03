import { describe, expect, it, vi } from 'vitest';
import { createSelectionApiModify } from '../../src/canvas/editor/selection_api_modify.js';
import { featherSelection } from '../../src/canvas/editor/pixel_selection.js';

// The controller test exposes which immutable source each preview consumes;
// actual raster/contour pixels are checked separately in the real UI suite.
vi.mock('../../src/canvas/editor/pixel_selection.js', () => ({
  featherSelection: vi.fn((_bitmap, selection, _node, radius) => ({ ...selection,
    contours: selection.contours.map(ring => ring.map(([x, y]) => [x + radius, y + radius])),
    bounds: { ...selection.bounds, x: selection.bounds.x + radius, y: selection.bounds.y + radius }, feather: radius })),
  borderSelection: vi.fn(), combineSelections: vi.fn(), expandContractSelection: vi.fn(),
  invertSelection: vi.fn(), smoothSelection: vi.fn(),
}));
const rectangle = x => ({ nodeId: 'image', contours: [[[x, 0], [x + 20, 0], [x + 20, 20], [x, 20]]], bounds: { x, y: 0, width: 20, height: 20 } });
function fixture(original = rectangle(0), initialRadius = 0) {
  let current = original, radius = initialRadius;
  const api = {};
  Object.assign(api, createSelectionApiModify({
    getDoc: () => ({ nodes: [{ id: 'image', kind: 'image', width: 100, height: 100 }] }),
    getPixelSelection: () => current, setPixelSelection: value => { current = value; },
    getSelectionFeather: () => radius, setSelectionFeather: value => { radius = value; },
    cache: { get: () => ({ width: 100, height: 100 }) }, syncAnts() {}, requestRender() {}, notify() {},
  }, api));
  return { api, get: () => current, radius: () => radius, replace: next => { current = next; } };
}
describe('selection Feather preview preimage', () => {
  it('restores the exact original contours when radius returns to the pre-edit value', () => {
    const original = rectangle(0), f = fixture(original);
    f.api.setSelectionFeather(7); expect(f.get()).not.toEqual(original);
    f.api.setSelectionFeather(0); expect(f.radius()).toBe(0); expect(f.get()).toBe(original);
  });
  it('does not accumulate preview transforms while typing multiple radii', () => {
    const original = rectangle(0), f = fixture(original);
    f.api.setSelectionFeather(7); const first = f.get();
    f.api.setSelectionFeather(11); f.api.setSelectionFeather(7);
    expect(f.get()).toEqual(first); expect(featherSelection.mock.calls.at(-1)[1]).toBe(original);
  });
  it('can cancel to a nonzero original value without applying another feather pass', () => {
    const original = { ...rectangle(4), feather: 3 }, f = fixture(original, 3);
    f.api.setSelectionFeather(7); f.api.setSelectionFeather(3);
    expect(f.radius()).toBe(3); expect(f.get()).toBe(original);
  });
  it('restarts the preimage after an external selection replacement', () => {
    const f = fixture(); f.api.setSelectionFeather(7); f.api.setSelectionFeather(0);
    const replacement = rectangle(50); f.replace(replacement);
    f.api.setSelectionFeather(7); f.api.setSelectionFeather(0);
    expect(f.get()).toBe(replacement);
  });
  it('does not restore stale contours after a separate explicit feather operation', () => {
    const f = fixture(); f.api.setSelectionFeather(7); f.api.featherPixelSelection(4);
    const changed = f.get(); f.api.setSelectionFeather(9); f.api.setSelectionFeather(7);
    expect(f.get()).toBe(changed);
  });
  it('still updates the default radius when there is no active pixel selection', () => {
    const f = fixture(null); f.api.setSelectionFeather(7);
    expect(f.radius()).toBe(7); expect(f.get()).toBe(null);
  });
});
