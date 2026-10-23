import { expect, it } from 'vitest';
import { summarizeCpuProfile } from '../e2e/cpu_profile_summary.mjs';

it('attributes sample intervals to leaf and ancestor stacks separately', () => {
  const frame = (functionName, url = '') => ({ functionName, url, lineNumber: 0 });
  const result = summarizeCpuProfile({ nodes: [
    { id: 1, callFrame: frame('(root)'), children: [2] },
    { id: 2, callFrame: frame('render', '/renderer.js'), children: [3] },
    { id: 3, callFrame: frame('paint', '/paint.js') },
  ], samples: [2, 3, 3], timeDeltas: [1000, 2000, 3000] });
  expect(result.durationMs).toBe(6);
  expect(result.self[0]).toMatchObject({ function: 'paint', selfMs: 5 });
  expect(result.inclusive[0]).toMatchObject({ function: 'render', selfMs: 1, inclusiveMs: 6 });
});
