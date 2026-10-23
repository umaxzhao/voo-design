import { it, expect, vi } from 'vitest';
import { documentRenderListener } from '../../src/canvas/editor/render_notifications.js';

it('skips camera renders but publishes edits, undo, and page switches', () => {
  const original = { nodes: [] };
  let doc = original;
  const listener = vi.fn();
  const render = documentRenderListener(() => doc, listener);
  render(); render();
  expect(listener).not.toHaveBeenCalled();
  doc = { nodes: [] }; render();
  doc = original; render();
  doc = { ...original, id: 'page2' }; render();
  render();
  expect(listener).toHaveBeenCalledTimes(3);
});
