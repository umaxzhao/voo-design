import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/canvas/editor/scene_renderer.js', () => ({ draw: vi.fn(), resizeCanvas: vi.fn() }));
import { draw } from '../../src/canvas/editor/scene_renderer.js';
import { renderEngineStage } from '../../src/canvas/editor/editor_engine_render.js';
import { drawSelection } from '../../src/canvas/editor/chrome_selection.js';
import { isPaintTool } from '../../src/canvas/editor/paint_tool_ids.js';

const image = { id: 'img', kind: 'image', x: 10, y: 20, width: 100, height: 60 };

function render(tool, node = image) {
  globalThis.window = { devicePixelRatio: 1 };
  const noop = () => null;
  renderEngineStage({
    ctx: {}, canvas: {}, stage: { clientWidth: 800, clientHeight: 600 },
    doc: { width: 800, height: 600, nodes: [node] },
    selection: { getId: () => node.id, getIds: () => [node.id] },
    tool, getEffectiveNode: (n) => n,
    viewportTools: { getViewport: () => ({ zoom: 1, panX: 0, panY: 0 }) },
    crop: { getCropRect: noop }, annotations: { getEditingTextId: noop, getEditingRegionId: noop },
    maskTools: { api: { getLasso: noop }, maskSourceOf: noop },
    paintTools: { bitmapSourceOf: noop },
    penTools: { api: { getEdit: noop, getDraft: noop, insertionPreview: noop } },
  });
  return draw.mock.calls.at(-1)[1];
}

describe('paint tools show only a faint image outline', () => {
  it.each(['brush', 'eraser', 'healing', 'smudge', 'blur', 'sharpen', 'dodge', 'burn', 'sponge', 'fill'])(
    '%s hides the handles and flags the outline', (tool) => {
      const options = render(tool);
      expect(isPaintTool(tool)).toBe(true);
      expect(options.selectionRect).toEqual({ x: 10, y: 20, width: 100, height: 60 });
      expect(options.selectionHandles).toBe(false);
      expect(options.selectionPaintOutline).toBe(true);
    });

  it('keeps the full transform box for the select tool', () => {
    const options = render('select');
    expect(options.selectionHandles).toBe(true);
    expect(options.selectionPaintOutline).toBe(false);
  });

  it('does not outline a non-image layer with a paint tool', () => {
    const options = render('brush', { id: 'r', kind: 'rect', x: 0, y: 0, width: 5, height: 5 });
    expect(options.selectionPaintOutline).toBe(false);
    expect(options.selectionRect).toBeNull();
  });

  it('draws the outline at 20% opacity with no handle rectangles', () => {
    const alphas = [];
    const fills = [];
    const ctx = {
      globalAlpha: 1,
      save: vi.fn(), restore: vi.fn(),
      strokeRect() { alphas.push(this.globalAlpha); },
      fillRect(...rect) { fills.push(rect); },
    };
    drawSelection(ctx, image, { zoom: 1, panX: 0, panY: 0 }, false, image,
      false, null, false, null, true);
    expect(alphas).toEqual([0.2]);
    expect(fills).toHaveLength(0);
    expect(ctx.restore).toHaveBeenCalled();
  });
});
