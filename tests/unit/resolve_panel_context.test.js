import { describe, expect, it } from 'vitest';
import { PROPERTY_SECTIONS, propertyType, resolvePanelForContext } from '../../src/canvas/components/editor_properties/resolve_panel_context.js';
const resolve = (kind, tool = 'select', extra = {}) => resolvePanelForContext({ tool, selection: [{ kind, ...extra }] });
describe('dynamic properties context', () => {
  it.each(Object.keys(PROPERTY_SECTIONS))('selects the %s properties', kind => {
    const result = resolve(kind);
    expect(result.panel).toBe('properties');
    expect(result.sections).toEqual(PROPERTY_SECTIONS[kind]);
  });
  it.each(['rect', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'pen', 'text'])('selection wins over %s defaults', tool => {
    expect(resolve('rect', tool).panel).toBe('properties');
    expect(resolvePanelForContext({ tool, selection: [] }).panel).toBe('tool');
  });
  it('keeps the no-selection move context on the background', () => {
    expect(resolvePanelForContext().panel).toBe('background');
  });
  it.each(['line', 'group', 'image', 'vector', 'ellipse'])('%s never exposes rectangle radius', kind => {
    expect(resolve(kind).sections).not.toContain('radius');
  });
  it('restricts group, line and raster paint', () => {
    expect(resolve('group').sections).not.toContain('fill');
    expect(resolve('group').sections).not.toContain('stroke');
    expect(resolve('line').sections).not.toContain('fill');
    expect(resolve('image').sections).toEqual(['transform', 'layer', 'effects', 'export']);
    expect(resolve('image').topBar).toBe('image');
    expect(resolve('ellipse').sections).toContain('arc');
  });
  it.each(['brush', 'crop', 'lasso', 'marquee', 'wand', 'eraser'])('puts %s in a top context bar', tool => {
    expect(resolvePanelForContext({ tool }).topBar).toBe(tool);
    expect(resolve('image', tool).panel).toBe('properties');
  });
  it('normalizes real scene encodings', () => {
    expect(propertyType({ kind: 'path', line: true })).toBe('line');
    expect(propertyType({ kind: 'path', poly: true })).toBe('polygon');
    expect(propertyType({ kind: 'group', isFrame: true })).toBe('frame');
    expect(propertyType({ kind: 'canvasInstance' })).toBe('instance');
  });
  it('intersects mixed selection capabilities', () => {
    const { sections } = resolvePanelForContext({ tool: 'rect', selection: [{ kind: 'rect' }, { kind: 'group' }] });
    expect(sections).not.toContain('radius');
    expect(sections).not.toContain('fill');
    expect(sections).toContain('transform');
  });
});


describe('complete selection and tool precedence matrix', () => {
  const tools = ['select', 'rect', 'ellipse', 'line', 'arrow', 'polygon', 'star', 'pen', 'curvature_pen', 'free_pen', 'text', 'dropper', 'fill', 'gradient', 'brush', 'eraser', 'crop', 'lasso', 'wand'];
  it.each(Object.keys(PROPERTY_SECTIONS))('%s keeps its sections for every active tool', kind => {
    for (const tool of tools) {
      expect(resolve(kind, tool)).toMatchObject({ panel: 'properties', sections: PROPERTY_SECTIONS[kind] });
    }
  });
  it.each(['brush', 'eraser', 'healing', 'retouch', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'crop', 'marquee', 'lasso', 'wand', 'region', 'select_region', 'ai_select'])('%s has a raster toolbar without selection', tool => {
    expect(resolvePanelForContext({ tool, selection: [] })).toEqual({ panel: 'tool', sections: [], topBar: tool });
  });
  it.each([
    [{ kind: 'path', poly: true, star: true }, 'star'],
    [{ kind: 'path', arrow: true }, 'line'],
    [{ kind: 'group', isComponent: true }, 'component'],
    [{ kind: 'rectangle' }, 'rectangle'],
    [{ kind: 'video' }, 'media'], [{ kind: 'audio' }, 'media'], [{ kind: 'model3d' }, 'media'],
    [{ kind: 'unknown' }, 'vector'],
  ])('normalizes %j to %s', (node, type) => expect(propertyType(node)).toBe(type));
  it('accepts a single node and ignores empty selection entries', () => {
    expect(resolvePanelForContext({ tool: 'rect', selection: { kind: 'rect' } }).sections).toEqual(PROPERTY_SECTIONS.rectangle);
    expect(resolvePanelForContext({ tool: 'rect', selection: [null, { kind: 'rect' }] }).panel).toBe('properties');
  });
});
