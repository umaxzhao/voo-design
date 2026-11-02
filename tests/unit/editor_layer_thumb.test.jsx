import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderImageThumb } from '../../src/canvas/components/editor_layer_thumb.jsx';

afterEach(() => vi.unstubAllGlobals());

describe('image thumbnail fit-inside scaling', () => {
  it.each([
    [400, 100, 0, 13, 56, 14],
    [100, 400, 23, 0, 10, 40],
  ])('fits a %i × %i bitmap inside the 56 × 40 backing canvas',
    (width, height, x, y, drawWidth, drawHeight) => {
      const bitmap = { width, height };
      const drawImage = vi.fn();
      const canvas = {
        getContext: vi.fn(() => ({ drawImage })),
        toDataURL: vi.fn(() => 'data:image/png;base64,thumb'),
      };
      const createElement = vi.fn(() => canvas);
      vi.stubGlobal('document', { createElement });

      expect(renderImageThumb(bitmap, { kind: 'image' })).toBe('data:image/png;base64,thumb');
      expect(createElement).toHaveBeenCalledWith('canvas');
      expect([canvas.width, canvas.height]).toEqual([56, 40]);
      expect(drawImage).toHaveBeenCalledTimes(1);
      expect(drawImage).toHaveBeenCalledWith(
        bitmap, 0, 0, width, height, x, y, drawWidth, drawHeight,
      );
      // Math.max would instead draw 160 × 40 or 56 × 224, clipping edges.
      expect(x + drawWidth).toBeLessThanOrEqual(canvas.width);
      expect(y + drawHeight).toBeLessThanOrEqual(canvas.height);
    });
});
