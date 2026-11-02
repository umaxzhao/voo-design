import { expect, it } from 'vitest';
import { htmlToNodes } from '../../../src/canvas/agent/html_pipeline/html_to_nodes.js';
import { parseGradient } from '../../../src/canvas/color_picker/gradient_fill.js';

const rect = { x: 10, y: 20, width: 48, height: 48 };
function el(tag, css = {}, children = [], attrs = {}, box = rect) {
  const node = { nodeType: 1, tagName: tag, dataset: {}, css: { opacity: '1', backgroundColor: 'transparent', ...css }, children: children.filter(c => c.nodeType === 1), childNodes: children, getAttribute: name => attrs[name] ?? null, getBoundingClientRect: () => box };
  children.forEach(c => { c.parentElement = node; });
  return node;
}
function document(body, colors) {
  let selected;
  return { body, defaultView: { getComputedStyle: el => el.css },
    createElement: colors ? () => ({ getContext: () => ({
      set fillStyle(s) { if (/^#[\da-f]{6}$/i.test(s) || colors[s]) this.value = colors[s] || s; },
      get fillStyle() { return this.value; },
    }) }) : undefined,
    createRange: () => ({ selectNodeContents(n) { selected = n; }, getClientRects: () => [selected.parentElement.getBoundingClientRect()], getBoundingClientRect: () => selected.parentElement.getBoundingClientRect() }),
  };
}
it('normalizes alpha, including percentages, hex and HSL; rejects unknown paints', () => {
  for (const [value, fill, alpha] of [
    ['rgba(255, 255, 255, 0.12)', '#ffffff', 0.12], ['rgb(100% 0% 0% / 25%)', '#ff0000', 0.25],
    ['#1234', '#112233', 68 / 255], ['hsl(120 100% 50% / 30%)', '#00ff00', 0.3],
  ]) {
    expect(htmlToNodes(document(el('DIV', { backgroundColor: value, backdropFilter: 'blur(10px)' })))[0]).toMatchObject({ fill, fillOpacity: alpha });
  }
  for (const value of ['transparent', 'rgba(0,0,0,0)', 'garbage', 'color-mix(in srgb, nope, missing)', 'oklch(broken)']) {
    expect(htmlToNodes(document(el('DIV', { backgroundColor: value, backdropFilter: 'blur(10px)' })))).toEqual([]);
  }
});
it('uses a validated canvas round-trip for modern CSS colors without accepting rejected assignments', () => {
  for (const value of ['color-mix(in srgb, red 50%, transparent)', 'oklch(50% 0.1 120 / 50%)']) {
    const doc = document(el('DIV', { backgroundColor: value }), { [value]: 'rgba(100, 120, 80, 0.5)' });
    expect(htmlToNodes(doc)[0]).toMatchObject({ fill: '#647850', fillOpacity: 0.5 });
    doc.body.css.backgroundColor = 'bad-color'; expect(htmlToNodes(doc)).toEqual([]);
  }
});
it('emits renderer-readable linear and radial gradients with transparent stops', () => {
  for (const kind of ['linear', 'radial']) {
    const [node] = htmlToNodes(document(el('DIV', { backgroundImage: `${kind}-gradient(rgba(255,0,0,.5) 0%, transparent 100%)` })));
    const parsed = parseGradient(node.fill);
    expect(parsed.stops).toMatchObject([{ color: '#FF0000', opacity: 50, position: 0 }, { color: '#000000', opacity: 0, position: 100 }]);
  }
});
it('keeps inline sibling labels at their own rects and emits only parent direct text', () => {
  const labels = ['Product', 'Solutions', 'Resources', 'Pricing'].map((text, i) => el('A', { color: 'black' }, [{ nodeType: 3, textContent: text }], {}, { ...rect, x: i * 100 }));
  const body = el('NAV', { color: 'black' }, [{ nodeType: 3, textContent: 'Menu' }, ...labels]);
  const nodes = htmlToNodes(document(body));
  expect(nodes.map(n => n.text)).toEqual(['Menu', 'Product', 'Solutions', 'Resources', 'Pricing']);
  expect(nodes.slice(1).map(n => n.x)).toEqual([0, 100, 200, 300]);
});
it('paints top and bottom borders as independent thin rectangles', () => {
  const nodes = htmlToNodes(document(el('DIV', { borderTopWidth: '1px', borderTopColor: 'rgba(0,0,0,.1)', borderBottomWidth: '2px', borderBottomColor: 'red' })));
  expect(nodes).toHaveLength(2);
  expect(nodes[0]).toMatchObject({ type: 'rect', x: 10, y: 20, width: 48, height: 1, fillOpacity: 0.1, strokeWidth: 0 });
  expect(nodes[1]).toMatchObject({ type: 'rect', y: 66, height: 2, fill: '#ff0000', strokeWidth: 0 });
});
it('converts SVG primitives and scales viewBox anchors and handles, preserving paint', () => {
  const shapes = [el('path', {}, [], { d: 'M2 3 H6 V8 L9 10 C10 11 12 13 14 15 S18 19 20 21 Q21 22 22 23 A2 2 0 0 1 24 24 Z' }),
    el('circle', {}, [], { cx: '12', cy: '12', r: '3' }), el('rect', {}, [], { x: '2', y: '3', width: '5', height: '4' }),
    el('line', {}, [], { x1: '1', y1: '2', x2: '3', y2: '4' }), el('polyline', {}, [], { points: '1,2 3,4 5,6' }), el('polygon', {}, [], { points: '1,2 3,4 5,6' })];
  const svg = el('svg', { color: 'red' }, shapes, { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' });
  const nodes = htmlToNodes(document(svg));
  expect(nodes).toHaveLength(6);
  expect(nodes[0]).toMatchObject({ type: 'path', fill: 'transparent', stroke: '#ff0000', strokeWidth: 3, baseWidth: 48 });
  expect(nodes[0].points.slice(0, 3)).toMatchObject([{ x: 4, y: 6 }, { x: 12, y: 6 }, { x: 12, y: 16 }]);
  expect(nodes[0].points.some(p => p.in && p.out)).toBe(true);
  expect(nodes[0].points.at(-1).close).toBe(true);
  expect(nodes[1]).toMatchObject({ type: 'ellipse', x: 28, y: 38, width: 12, height: 12 });
  expect(nodes[4].points.at(-1).close).toBe(false);
  expect(nodes[5].points.at(-1).close).toBe(true);
});
it('skips invalid SVG paths and never emits an icon-sized fallback box', () => {
  for (const d of ['nonsense', 'M0 0 X4 4', 'M0 0 C1 2', 'M0 0 Z 9']) {
    expect(htmlToNodes(document(el('svg', {}, [el('path', {}, [], { d })], { viewBox: '0 0 24 24' })))).toEqual([]);
  }
});
it('keeps separate open SVG subpaths from becoming connected strokes', () => {
  const nodes = htmlToNodes(document(el('svg', {}, [el('path', {}, [], { d: 'M1 2 L3 4 m2 2 l1 1', fill: 'none', stroke: 'black' })], { viewBox: '0 0 24 24' })));
  expect(nodes).toHaveLength(2);
  expect(nodes[1].points).toMatchObject([{ x: 10, y: 12 }, { x: 12, y: 14 }]);
});
it('rasterizes a valid Color 4 canvas serialization when it is not returned as rgba', () => {
  const doc = document(el('DIV', { backgroundColor: 'oklch(50% 0.1 120 / 50%)' }));
  doc.createElement = () => ({ getContext: () => ({
    set fillStyle(s) { this.value = s; }, get fillStyle() { return this.value; },
    clearRect() {}, fillRect() {}, getImageData: () => ({ data: [80, 110, 20, 128] }),
  }) });
  expect(htmlToNodes(doc)[0]).toMatchObject({ fill: '#506e14', fillOpacity: 128 / 255 });
});
it('rejects malformed HSL instead of coercing invalid components to black', () => {
  for (const backgroundColor of ['hsl(nope 0% 0%)', 'hsl(0 0% 0% / bad)']) {
    expect(htmlToNodes(document(el('DIV', { backgroundColor })))).toEqual([]);
  }
});
