import { it, expect, vi } from 'vitest';
import { layoutTextLines } from '../../src/canvas/editor/text_metrics.js';
it('reuses paragraph shaping by content, font style and width and protects cached arrays', () => {
  const ctx = { save() {}, restore() {}, font: '12px sans-serif', measureText: vi.fn(s => ({ width: s.length * 6 })) };
  const node = { text: 'one two three', boxWidth: 50, fontSize: 12, fontFamily: 'sans-serif' };
  const expected = layoutTextLines(ctx, node); const calls = ctx.measureText.mock.calls.length;
  expect(layoutTextLines(ctx, { ...node })).toBe(expected);
  expect(() => expected.push('mutation')).toThrow(TypeError);
  expect(layoutTextLines(ctx, node)).toEqual(expected);
  expect(ctx.measureText).toHaveBeenCalledTimes(calls);
  layoutTextLines(ctx, { ...node, boxWidth: 30 });
  expect(ctx.measureText.mock.calls.length).toBeGreaterThan(calls);
  const next = ctx.measureText.mock.calls.length;
  layoutTextLines(ctx, { ...node, fontSize: 18, fontFamily: 'serif' }); expect(ctx.measureText.mock.calls.length).toBeGreaterThan(next);
});

it('invalidates layouts and tile revisions through the shared font listeners', async () => {
  const { getTextLayout, clearTextLayoutCache, textMetricsRevision } = await import('../../src/canvas/editor/text_metrics.js');
  const listeners = {};
  const addEventListener = vi.fn((event, listener) => { listeners[event] = listener; });
  vi.stubGlobal('document', { fonts: { addEventListener } });
  try {
    const ctx = { save() {}, restore() {}, measureText: s => ({ width: s.length * 6 }) };
    const node = { text: 'hello', fontSize: 12, fontFamily: 'sans-serif' };
    let layout = getTextLayout(ctx, node);
    expect(getTextLayout(ctx, node)).toBe(layout);
    expect(addEventListener).toHaveBeenCalledTimes(2);
    for (const invalidate of [listeners.loadingdone, listeners.loadingerror, clearTextLayoutCache]) {
      const revision = textMetricsRevision();
      invalidate();
      expect(textMetricsRevision()).toBe(revision + 1);
      const next = getTextLayout(ctx, node);
      expect(next).not.toBe(layout);
      layout = next;
    }
    expect(addEventListener).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});
