import { expect, it, vi } from 'vitest';
import postcss from 'postcss';
// Vitest stubs CSS imports in node tests, including ?raw. Read the real asset.
vi.mock('../../../src/canvas/agent/html_pipeline/tailwind_lite.css?raw', async () => {
  const { readFileSync } = await import('node:fs');
  return { default: readFileSync(new URL('../../../src/canvas/agent/html_pipeline/tailwind_lite.css', import.meta.url), 'utf8') };
});
import css from '../../../src/canvas/agent/html_pipeline/tailwind_lite.css?raw';
import { HtmlRenderer } from '../../../src/canvas/agent/html_pipeline/render_html.js';
it('provides offline layout, typography, palette and brand utilities', () => {
  const rules = new Map();
  postcss.parse(css).walkRules(rule => rules.set(rule.selector, Object.fromEntries(rule.nodes.filter(n => n.type === 'decl').map(n => [n.prop, n.value]))));
  expect(rules.get('.flex').display).toBe('flex');
  expect(rules.get('.items-center')['align-items']).toBe('center');
  expect(rules.get('.p-4').padding).toBe('1rem');
  expect(rules.get('.text-sm')['font-size']).toBe('0.875rem');
  for (const family of ['slate', 'gray', 'neutral', 'zinc']) for (const prefix of ['text', 'bg', 'border']) expect(rules.has(`.${prefix}-${family}-500`)).toBe(true);
  expect(rules.get('.bg-primary')['background-color']).toContain('--ds-colors-primary');
  expect(css.replace(/\/\*[^]*?\*\//g, '')).not.toMatch(/@import|url\(/);
});
it('inlines utilities before custom styles and before measurement without network access', async () => {
  let source, measured = false;
  const doc = { body: { getBoundingClientRect() { measured = true; expect(source).toContain(css); } } };
  const iframe = { style: {}, setAttribute() {}, contentDocument: doc, set srcdoc(value) { source = value; queueMicrotask(() => this.onload()); }, remove() {} };
  const renderer = new HtmlRenderer({ document: { createElement: () => iframe, body: { append() {} } } });
  await renderer.render('<html><head><style>:root{--ds-colors-primary:red}</style></head><body class="flex p-4"></body></html>', { width: 200, height: 100 });
  expect(source.indexOf('data-voo-tailwind-lite')).toBeLessThan(source.indexOf(':root{--ds-colors-primary:red}'));
  expect(source).toContain("default-src 'none'");
  expect(measured).toBe(true);
  renderer.dispose();
});
