import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/canvas/use_i18n.js', () => ({ useI18n: () => ({ t: key => key }) }));
import VariantsSection from '../../src/canvas/components/editor_properties/variants_section.jsx';
const main = { canvasId: 'main', nodes: [], variantGroupId: 'set', variantName: 'Size=Small, State=Idle' };
const large = { ...main, canvasId: 'large', variantName: 'Size=Large, State=Idle' };
const host = { nodes: [], components: { main, large } };
const engine = { getDocument: () => host };
describe('variant inspector', () => {
  it('renders property dropdowns for instances', () => {
    const html = renderToStaticMarkup(<VariantsSection engine={engine} node={{ id: 'instance', sourceCanvasId: 'main' }} />);
    expect(html).toContain('aria-label="Size"');
    expect(html).toContain('aria-label="State"');
    expect(html).toContain('value="Small" selected');
  });
  it('renders a single dropdown for plain names', () => {
    const plainEngine = { getDocument: () => ({ ...host, components: { main: { ...main, variantName: 'Default' }, large } }) };
    const html = renderToStaticMarkup(<VariantsSection engine={plainEngine} node={{ id: 'instance', sourceCanvasId: 'main' }} />);
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).toContain('Default');
  });
  it('renders Add variant for main components', () => {
    const html = renderToStaticMarkup(<VariantsSection engine={{ getDocument: () => main }} isMainComponent />);
    expect(html).toContain('editor.variants.add');
    expect(html).not.toContain('<select');
  });
  it('does not show controls on ordinary canvases', () => {
    expect(renderToStaticMarkup(<VariantsSection engine={{ getDocument: () => ({ canvasId: 'page', nodes: [] }) }} />)).toBe('');
  });
});
