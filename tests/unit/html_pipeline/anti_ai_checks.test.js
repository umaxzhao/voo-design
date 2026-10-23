import { expect, it } from 'vitest';
import { runAntiAiChecks } from '../../../src/canvas/agent/html_pipeline/anti_ai_checks.js';
import { expandLucideIcons } from '../../../src/canvas/agent/html_pipeline/lucide.js';
import { scoreDocument } from '../../../scripts/design-bench/score.mjs';
import { formatReport } from '../../../scripts/design-bench/report.mjs';
it.each(['<h2>Welcome ✨</h2>', '<i data-lucide="sparkles"></i>', '<svg><path fill="red"/><path fill="blue"/></svg>', '<div><div class="bg-blue-100"><i data-lucide="home"></i></div><h2>Home</h2></div>'])('hard fails decoration: %s', html => {
  expect(runAntiAiChecks({ html }).hardFail).toBe(true);
});
it('penalizes verbose headings, paragraphs and filler subtitles', () => {
  const result = runAntiAiChecks({ html: '<h2>One two three four five six</h2><p>Everything you need at a glance</p><p>' + 'word '.repeat(21) + '</p>' });
  expect(result.hardFail).toBe(false);
  expect(result.verbosityPenalty).toBe(3);
});
it('accepts functional monochrome icons before and after expansion', () => {
  const html = '<button class="text-slate-600"><i data-lucide="search"></i>Search</button>';
  for (const source of [html, expandLucideIcons(html)]) expect(runAntiAiChecks({ html: source })).toMatchObject({ hardFail: false, verbosityPenalty: 0 });
});
it('carries decorative failures through scoring and reporting', async () => {
  const score = await scoreDocument({}, { lint: null, html: '<p>✨</p>' });
  expect(score.failed).toBe(true);
  expect(formatReport({ tasks: [] }, { tasks: [{ id: 'test', ...score }] })).toContain('anti-AI failed');
});
