import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { incrementalHtmlToDocument, htmlTreeToDocument } from '../../src/canvas/editor/html_import.js';
import { resolveFill } from '../../src/canvas/editor/html_import_style.js';
import { parseGradient } from '../../src/canvas/color_picker/gradient_fill.js';
import { reflowAutoLayout } from '../../src/canvas/editor/scene_auto_layout.js';
import { cssAutoLayout } from '../../src/canvas/editor/html_import_autolayout.js';
import { makeTextLayer, makeShapeLayer, makeSideBorderLayers, resolveRadius } from '../../src/canvas/editor/html_import_layers.js';

const box = { x: 0, y: 0, width: 120, height: 100 };
describe('HTML to native nodes', () => {
  for (const name of readdirSync(new URL('../fixtures/html2nodes/', import.meta.url)).filter(n => n.endsWith('.html') && n !== 'tailwind.html')) {
    it(`imports ${name} without a browser`, () => {
      const html = readFileSync(new URL(`../fixtures/html2nodes/${name}`, import.meta.url), 'utf8');
      const result = incrementalHtmlToDocument(html, { width: 320, height: 200 });
      expect(result.doc.nodes.length).toBeGreaterThan(0);
      for (const node of result.doc.nodes) for (const key of ['x', 'y', 'width', 'height']) expect(Number.isFinite(node[key])).toBe(true);
      if (name === 'media.html') {
        expect(result.doc.nodes.some(n => n.kind === 'path')).toBe(true);
        expect(result.doc.nodes.find(n => n.kind === 'path').stroke).toBe('#2563eb');
        expect(result.pendingImages).toHaveLength(1);
      }
    });
  }
  it('maps flex axis, gaps, padding and alignment', () => {
    expect(cssAutoLayout({ display: 'flex', flexDirection: 'column', gap: '8px 12px', padding: '10px 20px', alignItems: 'flex-end', justifyContent: 'space-between' })).toMatchObject({ direction: 'vertical', gap: 8, crossGap: 12, padding: { top: 10, right: 20, bottom: 10, left: 20 }, alignItems: 'end', justifyContent: 'space-between' });
    expect(cssAutoLayout({ display: 'grid' })).toMatchObject({ direction: 'horizontal', wrap: true });
    expect(cssAutoLayout({ display: 'block' })).toBeNull();
    expect(cssAutoLayout({ display: 'flex', padding: '1rem', paddingTop: '16px' }).padding.top).toBe(16);
  });
  it('keeps backgrounds and absolute children out of frame flow', () => {
    const { doc } = htmlTreeToDocument({ tag: 'main', style: { width: 320, height: 200 }, children: [{ tag: 'div', style: { display: 'flex', width: 100, height: 100, background: '#eee' }, children: [{ tag: 'div', style: { width: 10, height: 10, background: 'red' } }, { tag: 'div', style: { position: 'absolute', width: 5, height: 5, background: 'blue' } }] }] });
    const group = doc.nodes.find(n => n.autoLayout);
    expect(group).toBeDefined();
    const children = doc.nodes.filter(n => n.parentId === group.id);
    expect(children.filter(n => n.layoutPosition !== 'absolute')).toHaveLength(1);
  });
  it('keeps each painted HTML element as one native layout item', () => {
    const { doc } = htmlTreeToDocument({ tag: 'main', style: { display: 'flex', width: 300, height: 100, gap: 10 }, children: [{ tag: 'button', text: 'OK', style: { width: 80, height: 40, background: 'red' } }, { tag: 'div', style: { width: 60, height: 40, background: 'blue' } }] });
    const frame = doc.nodes.find(n => n.autoLayout);
    const items = doc.nodes.filter(n => n.parentId === frame.id);
    expect(items).toHaveLength(2);
    expect(items.every(n => n.kind === 'group')).toBe(true);
    const next = reflowAutoLayout(doc);
    const button = next.nodes.find(n => n.id === items[0].id);
    const blue = next.nodes.find(n => n.id === items[1].id);
    expect(blue.x).toBe(button.x + button.width + 10);
    expect(next.nodes.filter(n => n.parentId === button.id)).toHaveLength(2);
  });
  it('preserves font weights, metrics and text styling', () => {
    const node = makeTextLayer('Hello', box, { fontFamily: 'Arial', fontSize: '20px', fontWeight: '500', lineHeight: '30px', letterSpacing: '2px', color: '#123456', textAlign: 'right' }, { measuredText: true });
    expect(node).toMatchObject({ fontFamily: 'Arial', fontSize: 20, fontWeight: '500', lineHeight: 1.5, letterSpacing: 2, fill: '#123456', align: 'right', width: 120, boxWidth: 120, x: 0, metricsSource: 'browser-layout' });
  });
  it('preserves four corner radii and opacity', () => {
    const radius = resolveRadius({ borderRadius: '2px 4px 6px 8px' }, box);
    expect(radius).toEqual({ tl: 2, tr: 4, br: 6, bl: 8 });
    expect(resolveRadius({ borderRadius: '50%' }, box)).toBe(50);
    expect(makeShapeLayer(box, 'rgba(1,2,3,0.4)', radius, { opacity: '.3' })).toMatchObject({ cornerRadius: radius, opacity: .3, fill: 'rgba(1,2,3,0.4)' });
  });
  it('makes per-side borders editable inside their CSS bounds', () => {
    const nodes = makeSideBorderLayers(box, { borderTop: '2px solid red', borderRight: '3px solid blue', borderBottom: '4px solid green', borderLeft: '5px solid black' });
    expect(nodes).toHaveLength(4);
    expect(nodes[1]).toMatchObject({ x: 117, width: 3, height: 100 });
    expect(nodes[2]).toMatchObject({ y: 96, height: 4, width: 120 });
  });
  it('propagates container opacity with an explicit compositing warning', () => {
    const { doc, warnings } = htmlTreeToDocument({ tag: 'main', style: { opacity: '.5' }, children: [{ tag: 'div', style: { width: 10, height: 10, background: 'red', opacity: '.5' } }] });
    expect(doc.nodes.find(n => n.kind === 'rect').opacity).toBe(.25);
    expect(warnings).toContain('html-opacity-flattened');
  });
  it('encodes CSS gradient geometry for both native renderers', () => {
    const linear = parseGradient(resolveFill({ background: 'linear-gradient(90deg, red, blue)' }, {}, box));
    expect(linear.geometry.startX).toBeCloseTo(0);
    expect(linear.geometry.endX).toBeCloseTo(100);
    const radial = parseGradient(resolveFill({ background: 'radial-gradient(circle at 0% 0%, white, blue)' }, {}, box));
    expect(radial.geometry.centerX).toBe(0);
    expect(radial.geometry.centerY).toBe(0);
    const corner = parseGradient(resolveFill({ background: 'radial-gradient(circle at left top, white, blue)' }, {}, box));
    expect(corner.geometry.centerX).toBe(0);
    expect(corner.geometry.centerY).toBe(0);
    expect(Math.max(radial.geometry.width / 100 * box.width, radial.geometry.height / 100 * box.height) / 2).toBeCloseTo(Math.hypot(120, 100), 1);
  });
  it('keeps hierarchy opt-out available' , () => {
    const { doc } = htmlTreeToDocument({ tag: 'main', style: { display: 'flex' }, children: [{ tag: 'div', style: { background: 'red', width: 20, height: 20 } }] }, { preserveHierarchy: false });
    expect(doc.nodes.every(n => n.kind !== 'group')).toBe(true);
  });
});
