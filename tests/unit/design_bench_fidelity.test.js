import { expect, it, vi } from 'vitest';
import { compare, fidelity } from '../../scripts/design-bench/fidelity.mjs';
const rect = { x: 20, y: 30, width: 80, height: 40 };
function sample({ converted = rect, loaded = rect, autoLayout } = {}) {
  return { dom: [{ key: 'card', rect, styles: {}, texts: [] }], converted: [{ htmlKey: 'card', ...converted }],
    loaded: { nodes: [{ id: 'frame', autoLayout }, { htmlKey: 'card', parentId: 'frame', ...loaded }] }, textMetrics: [] };
}
it('ignores exactly one pixel and identifies conversion geometry before render', () => {
  expect(compare(sample({ converted: { ...rect, x: 21 }, loaded: { ...rect, x: 21 } }))).toEqual([]);
  expect(compare(sample({ converted: { ...rect, x: 23 }, loaded: { ...rect, x: 23 } }))).toMatchObject([
    { property: 'conversion.x', expected: 20, actual: 23, cause: 'html_to_nodes mapping' },
  ]);
});
it('attributes native geometry drift to an active parent autoLayout', () => {
  expect(compare(sample({ loaded: { ...rect, x: 50 }, autoLayout: { direction: 'horizontal' } }))).toMatchObject([
    { property: 'loaded.x', cause: 'auto-layout engine' },
  ]);
  expect(compare(sample({ loaded: { ...rect, x: 50 } }))[0].cause).toBe('renderer');
});
it('ignores invisible outlines but reports visible outlines even at one pixel', () => {
  for (const styles of [{ outlineStyle: 'none', outlineWidth: '3px' }, { outlineStyle: 'solid', outlineWidth: '0px' }]) {
    const data = sample(); data.dom[0].styles = styles;
    expect(compare(data)).toEqual([]);
  }
  const data = sample(); data.dom[0].styles = { outlineStyle: 'solid', outlineWidth: '1px' };
  expect(compare(data)).toMatchObject([{ property: 'outline' }]);
});
it('compares text conversion against CSS line boxes while retaining glyph baseline evidence', () => {
  const data = sample();
  const lineBox = { x: 20, y: 25, width: 80, height: 60 };
  data.dom[0].texts = [{ key: 'text', rect: { ...lineBox, y: 30, height: 50 }, lineBox, baseline: 46, rects: [{ y: 30 }, { y: 60 }] }];
  data.converted.push({ htmlKey: 'text', ...lineBox }); data.loaded.nodes.push({ htmlKey: 'text', ...lineBox });
  data.textMetrics.push({ key: 'text', baseline: 46, lines: ['one', 'two'], lineHeight: 30 });
  expect(compare(data)).toEqual([]);
});

it('explains how to fix a missing flock before creating worker artifacts', async () => {
  vi.stubEnv('PATH', '/nonexistent-flock-path');
  try {
    await expect(fidelity({ out: '/unused-fidelity-output' })).rejects.toThrow('flock is required for fidelity (util-linux). Install it or run without the lock wrapper.');
  } finally { vi.unstubAllEnvs(); }
});
