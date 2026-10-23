import { describe, it, expect, vi } from 'vitest';
import { TextLayoutCache } from '../../src/canvas/editor/text_layout_cache.js';
import { getTextLayout, measureText, clearTextLayoutCache } from '../../src/canvas/editor/text_metrics.js';
import { paintTextBody } from '../../src/canvas/editor/render_text_node.js';

function context() {
  return { save() {}, restore() {}, measureText: vi.fn(text => ({ width: text.length * 8 })), fillText: vi.fn() };
}
const node = { text: 'one two three four', fontFamily: 'sans-serif', fontSize: 16, fontWeight: 400, boxWidth: 80, x: 0, y: 0, width: 80, fill: '#000' };

describe('text layout cache', () => {
  it('shares measurement and paint layout through movement and view changes', () => {
    const ctx = context();
    measureText(ctx, node);
    const count = ctx.measureText.mock.calls.length;
    for (let i = 0; i < 10; i++) paintTextBody(ctx, { ...node, x: i, y: i, zoom: i + 1 });
    expect(ctx.measureText).toHaveBeenCalledTimes(count);
    expect(ctx.fillText).toHaveBeenCalled();
  });
  it.each([
    ['text', 'edited text'], ['fontFamily', 'serif'], ['fontWeight', 700],
    ['italic', true], ['fontSize', 20], ['lineHeight', 2],
    ['letterSpacing', 2], ['boxWidth', 40],
  ])('invalidates edits to %s, including in-place edits and undo', (field, value) => {
    const ctx = context();
    const edited = { ...node };
    const first = getTextLayout(ctx, edited);
    edited[field] = value;
    expect(getTextLayout(ctx, edited)).not.toBe(first);
    Object.assign(edited, node);
    delete edited[field];
    if (field in node) edited[field] = node[field];
    expect(getTextLayout(ctx, edited)).toBe(first);
  });
  it('isolates metric providers and clears on font load', () => {
    const listeners = {};
    vi.stubGlobal('document', { fonts: { addEventListener: (name, fn) => { listeners[name] = fn; } } });
    try {
      const ctx = context();
      const first = getTextLayout(ctx, node);
      expect(getTextLayout(context(), node)).not.toBe(first);
      listeners.loadingdone();
      expect(getTextLayout(ctx, node)).not.toBe(first);
      clearTextLayoutCache();
      expect(getTextLayout(ctx, node)).not.toBe(first);
    } finally { vi.unstubAllGlobals(); }
  });
  it('retains recent entries and bounds both entries and storage', () => {
    const cache = new TextLayoutCache(2, 1000);
    cache.set('a', 1); cache.set('b', 2); cache.get('a'); cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    cache.set('huge', 'x'.repeat(1000));
    expect(cache.entries.size).toBe(2);
    expect(cache.bytes).toBeLessThanOrEqual(1000);
    cache.clear(); expect(cache.bytes).toBe(0);
  });
  it('evicts by byte budget even below the entry limit', () => {
    const cache = new TextLayoutCache(100, 300);
    cache.set('a', 'small'); cache.set('b', 'small'); cache.set('c', 'small');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBe('small');
    expect(cache.bytes).toBeLessThanOrEqual(300);
    cache.set('c', 'replacement');
    expect(cache.get('c')).toBe('replacement');
  });
  it('preserves wrap, spacing, explicit blank lines and vertical bounds', () => {
    const ctx = context();
    const fixed = { ...node, text: 'one two three', boxWidth: 56 };
    expect(getTextLayout(ctx, fixed).lines).toEqual(['one two', 'three']);
    expect(measureText(ctx, fixed)).toEqual({ width: 56, height: 40 });
    const auto = { ...node, text: 'ab\n\ncd', boxWidth: 0, letterSpacing: 2 };
    expect(getTextLayout(ctx, auto).widths).toEqual([20, 8, 20]);
    expect(measureText(ctx, { ...auto, direction: 'vertical' })).toEqual({ width: 60, height: 36 });
  });
  it('returns immutable wrapping and keeps stroke/direction outside shared metrics', () => {
    const ctx = context();
    const layout = getTextLayout(ctx, node);
    expect(Object.isFrozen(layout.lines)).toBe(true);
    const plain = measureText(ctx, node);
    const stroked = measureText(ctx, { ...node, stroke: '#000', strokeWidth: 4 });
    expect(stroked.width).toBe(plain.width + 4);
    expect(getTextLayout(ctx, { ...node, direction: 'vertical' })).toBe(layout);
  });
});
