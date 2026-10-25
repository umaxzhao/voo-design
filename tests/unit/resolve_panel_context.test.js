import { describe, expect, it } from 'vitest';
import { PROPERTY_SECTIONS, propertyType, resolvePanelForContext } from '../../src/canvas/components/editor_properties/resolve_panel_context.js';

const resolve = (kind, tool = 'select', extra = {}) =>
  resolvePanelForContext({ tool, selection: [{ kind, ...extra }] });

const objectSelectionTools = ['select', 'select_region', 'perspective', 'distort', 'puppet_warp'];
const activeToolContexts = [
  'rect', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'pen', 'curvature_pen',
  'free_pen', 'text', 'dropper', 'fill', 'gradient', 'brush', 'eraser', 'healing',
  'retouch', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'crop',
  'marquee', 'lasso', 'wand', 'region', 'ai_select',
];

describe('dynamic properties context', () => {
  it.each(Object.keys(PROPERTY_SECTIONS))('select mode shows %s properties', kind => {
    const result = resolve(kind);
    expect(result.panel).toBe('properties');
    expect(result.sections).toEqual(PROPERTY_SECTIONS[kind]);
  });

  it.each(objectSelectionTools)('%s keeps the selected object in the inspector', tool => {
    expect(resolve('rect', tool)).toMatchObject({
      panel: 'properties',
      sections: PROPERTY_SECTIONS.rectangle,
    });
  });

  it.each(activeToolContexts)('%s shows its own context even with a selected layer', tool => {
    expect(resolvePanelForContext({ tool, selection: [{ kind: 'rect' }] })).toEqual({
      panel: 'tool',
      sections: [],
    });
  });

  it('keeps the no-selection move context on the background', () => {
    expect(resolvePanelForContext().panel).toBe('background');
  });

  it('treats an unspecified active tool as Select', () => {
    expect(resolvePanelForContext({ tool: null, selection: [{ kind: 'image' }] })).toMatchObject({
      panel: 'properties',
      sections: PROPERTY_SECTIONS.image,
    });
  });

  it.each(['line', 'group', 'vector', 'ellipse'])('%s never exposes rectangle radius', kind => {
    expect(resolve(kind).sections).not.toContain('radius');
  });

  it('gives an image the rectangle panel, with radius, fill, stroke, effects and alignment', () => {
    for (const section of ['alignment', 'radius', 'fill', 'stroke', 'effects']) {
      expect(resolve('image').sections).toContain(section);
    }
  });

  it('restricts group and line paint', () => {
    expect(resolve('group').sections).not.toContain('fill');
    expect(resolve('group').sections).not.toContain('stroke');
    expect(resolve('line').sections).not.toContain('fill');
    expect(resolve('image').sections).toEqual(PROPERTY_SECTIONS.rectangle);
    expect(resolve('ellipse').sections).toContain('arc');
  });

  it('shows tool controls without a selected object and object controls in Select mode', () => {
    expect(resolvePanelForContext({ tool: 'brush' })).toEqual({ panel: 'tool', sections: [] });
    expect(resolvePanelForContext({ tool: 'brush', selection: [{ kind: 'image' }] })).toEqual({
      panel: 'tool',
      sections: [],
    });
    expect(resolvePanelForContext({ tool: 'select', selection: [{ kind: 'image' }] })).toMatchObject({
      panel: 'properties',
      sections: PROPERTY_SECTIONS.image,
    });
  });

  it('normalizes real scene encodings', () => {
    expect(propertyType({ kind: 'path', line: true })).toBe('line');
    expect(propertyType({ kind: 'path', poly: true })).toBe('polygon');
    expect(propertyType({ kind: 'group', isFrame: true })).toBe('frame');
    expect(propertyType({ kind: 'canvasInstance' })).toBe('instance');
  });

  it('intersects mixed selection capabilities only in Select mode', () => {
    const { sections } = resolvePanelForContext({
      tool: 'select',
      selection: [{ kind: 'rect' }, { kind: 'group' }],
    });
    expect(sections).not.toContain('radius');
    expect(sections).not.toContain('fill');
    expect(sections).toContain('transform');
  });

  it('accepts a single node and ignores empty selection entries', () => {
    expect(resolvePanelForContext({ tool: 'select', selection: { kind: 'rect' } }).sections).toEqual(PROPERTY_SECTIONS.rectangle);
    expect(resolvePanelForContext({ tool: 'select', selection: [null, { kind: 'rect' }] }).panel).toBe('properties');
  });
});
