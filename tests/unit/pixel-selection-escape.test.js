import { afterEach, describe, expect, it, vi } from 'vitest';
import { unwindEscape } from '../../src/canvas/editor-shortcut-actions.js';
import { handleGestureShortcut } from '../../src/canvas/editor-shortcut-gestures.js';
import { shortcutTargetContext } from '../../src/canvas/editor-shortcut-target.js';

function fixture() {
  let pixel = { nodeId: 'image', contours: [[[0, 0], [20, 0], [20, 20], [0, 20]]] };
  let selected = ['image'];
  const engine = {
    getTool: () => 'marquee', getPixelSelection: () => pixel,
    clearPixelSelection: vi.fn(() => { pixel = null; }), commit: vi.fn(),
    getSelectedIds: () => selected, getSelected: () => selected.length ? { id: selected[0] } : null,
    select: vi.fn(() => { selected = []; }),
  };
  return { engine, run: () => unwindEscape({ engine, tool: 'marquee' }) };
}
afterEach(() => vi.unstubAllGlobals());

describe('pixel selection Escape priority', () => {
  it('clears only pixel selection and commits once before a later Escape deselects the layer', () => {
    const f = fixture(); expect(f.run()).toBe(true);
    expect(f.engine.clearPixelSelection).toHaveBeenCalledOnce();
    expect(f.engine.commit).toHaveBeenCalledWith('editor.history.entry.selection');
    expect(f.engine.select).not.toHaveBeenCalled(); expect(f.engine.getSelectedIds()).toEqual(['image']);
    expect(f.run()).toBe(true); expect(f.engine.select).toHaveBeenCalledWith(null);
    expect(f.engine.commit).toHaveBeenCalledOnce();
    expect(f.run()).toBe(false); expect(f.engine.commit).toHaveBeenCalledOnce();
  });
  for (const [query, cancel, value] of [
    ['cancelActiveGesture', 'cancelActiveGesture', true],
    ['getSelectionTransform', 'cancelSelectionTransform', {}],
    ['getPenDraft', 'cancelPen', {}],
    ['isEditing', 'endEdit', true],
    ['getMagneticLassoDraft', 'cancelMagneticLasso', {}],
    ['getPolygonDraft', 'cancelPolygonLasso', {}],
    ['getLasso', 'cancelLasso', {}],
  ]) it(`preserves ${query} cancellation priority over pixel selection`, () => {
    const f = fixture(); f.engine[query] = vi.fn(() => value);
    if (query !== cancel) f.engine[cancel] = vi.fn();
    expect(f.run()).toBe(true); expect(f.engine[cancel]).toHaveBeenCalledOnce();
    expect(f.engine.clearPixelSelection).not.toHaveBeenCalled(); expect(f.engine.commit).not.toHaveBeenCalled();
  });
  it('does not create history or raster state when no selection exists', () => {
    const f = fixture(); f.engine.getPixelSelection = () => null; f.engine.getSelectedIds = () => []; f.engine.getSelected = () => null;
    expect(f.run()).toBe(false); expect(f.engine.clearPixelSelection).not.toHaveBeenCalled(); expect(f.engine.commit).not.toHaveBeenCalled();
  });
  it('leaves an IME composition Escape to the existing gesture guard', () => {
    const f = fixture();
    expect(handleGestureShortcut({ key: 'Escape', isComposing: true }, { engine: f.engine })).toBe(true);
    expect(f.engine.clearPixelSelection).not.toHaveBeenCalled(); expect(f.engine.commit).not.toHaveBeenCalled();
  });
  for (const [tagName, type, isContentEditable] of [['INPUT', 'text', false], ['INPUT', 'number', false], ['TEXTAREA', '', false], ['DIV', '', true]]) {
    it(`keeps Escape ownership with ${tagName}/${type || 'editable'} controls`, () => {
      vi.stubGlobal('HTMLElement', class {}); const target = Object.assign(new HTMLElement(), { tagName, type, isContentEditable, closest: () => null });
      expect(shortcutTargetContext({ key: 'Escape', target }, { engine: fixture().engine, toolRef: { current: 'marquee' } })).toBe(null);
    });
  }
  it('lets a visible topmost menu own Escape even with focus on its external trigger', () => {
    const surface = { getClientRects: () => [1] };
    const ownerDocument = { querySelectorAll: () => [surface], defaultView: { getComputedStyle: () => ({ visibility: 'visible' }) } };
    const target = { ownerDocument, closest: () => null };
    expect(shortcutTargetContext({ key: 'Escape', target }, { engine: fixture().engine, toolRef: { current: 'marquee' } })).toBe(null);
  });
});
