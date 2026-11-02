import { it, expect, vi } from 'vitest';
import { createInteractionBackdrop, isSoftwareGpu } from '../../src/canvas/editor/interaction_backdrop.js';
function fixture() {
  const attrs = new Map(), styles = [];
  const root = { ownerDocument: { createElement: () => ({}), head: { append: e => styles.push(e) } },
    getAttribute: k => attrs.get(k) ?? null, setAttribute: (k,v) => attrs.set(k,v), removeAttribute: k => attrs.delete(k) };
  return { ctx: { canvas: { closest: () => root } }, attrs, styles };
}
it('only identifies known software drivers', () => {
  expect(isSoftwareGpu('ANGLE Vulkan SwiftShader')).toBe(true);
  expect(isSoftwareGpu('Mesa llvmpipe')).toBe(true);
  expect(isSoftwareGpu('ANGLE Intel Metal')).toBe(false);
});
it('restores settled blur, cancels stale quiet frames, and shares ownership across stages', () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 16));
  vi.stubGlobal('cancelAnimationFrame', id => clearTimeout(id));
  try {
    const { ctx, attrs, styles } = fixture(), other = { canvas: ctx.canvas };
    const quality = createInteractionBackdrop(() => true);
    quality.update(ctx, true); quality.update(other, true);
    expect(attrs.size).toBe(1); expect(styles).toHaveLength(1);
    vi.advanceTimersByTime(400);
    quality.update(ctx, true); // a slow frame cancels the queued restore
    vi.advanceTimersByTime(16);
    expect(attrs.size).toBe(1);
    quality.release(ctx);
    expect(attrs.size).toBe(0);
    quality.update(ctx, true);
    quality.update(ctx, false);
    expect(attrs.size).toBe(0);
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
});
it('does not change UI styles on hardware or unknown drivers', () => {
  const { ctx, attrs, styles } = fixture();
  createInteractionBackdrop(() => false).update(ctx, true);
  expect(attrs.size).toBe(0); expect(styles).toHaveLength(0);
});

it('includes the application header and restores its previous document tier', () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 16));
  vi.stubGlobal('cancelAnimationFrame', id => clearTimeout(id));
  try {
    const { ctx, attrs } = fixture();
    const editor = ctx.canvas.closest();
    editor.ownerDocument.documentElement = editor;
    const quality = createInteractionBackdrop(() => true);
    attrs.set('data-voo-camera-preview', 'previous');
    quality.update(ctx, true);
    expect(attrs.get('data-voo-camera-preview')).toBe('');
    quality.release(ctx);
    expect(attrs.get('data-voo-camera-preview')).toBe('previous');
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
});

it('adapts unknown drivers only after a slow gesture frame and restores the settled tier', () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 16));
  vi.stubGlobal('cancelAnimationFrame', id => clearTimeout(id));
  let now = 0; const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  try {
    const { ctx, attrs } = fixture(), quality = createInteractionBackdrop(() => false);
    quality.update(ctx, true);
    now = 16; quality.update(ctx, true);
    expect(attrs.size).toBe(0);
    now = 100; quality.update(ctx, true);
    expect(attrs.size).toBe(1);
    vi.advanceTimersByTime(416);
    expect(attrs.size).toBe(0);
  } finally { clock.mockRestore(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
