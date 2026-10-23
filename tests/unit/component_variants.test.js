import { describe, it, expect } from 'vitest';
import { duplicateComponentMaster, componentVariants, parseVariantName, variantProperties, matchVariantProperty, createVariantDocument, switchVariantDocument } from '../../src/canvas/editor/component_variants.js';
const source = { canvasId: 'main', isComponent: true, nodes: [{ id: 'layer' }] };
describe('component variant documents', () => {
  it('duplicates masters without changing layer ids', () => {
    expect(duplicateComponentMaster(source, { componentId: 'copy' }).nodes).toEqual(source.nodes);
    expect(source.canvasId).toBe('main');
  });
  it('creates a set and sibling immutably', () => {
    const next = createVariantDocument(source, source, 'Size=Large', 'large');
    expect(next.variantName).toBe('Default');
    expect(next.components.large.variantGroupId).toBe(next.variantGroupId);
    expect(source.variantGroupId).toBeUndefined();
    expect(componentVariants(next, next)).toHaveLength(2);
  });
  it('rejects duplicate names', () => {
    const next = createVariantDocument(source, source, 'Large', 'large');
    expect(() => createVariantDocument(next, next, 'Large', 'other')).toThrow();
  });
  it('uses current document metadata after undo', () => {
    const next = createVariantDocument(source, source, 'Large', 'large');
    expect(componentVariants(source, source)).toHaveLength(1);
    expect(componentVariants(next, source)).toHaveLength(2);
  });
  it('switches source while preserving geometry and clearing layer overrides', () => {
    const node = { id: 'instance', kind: 'canvasInstance', sourceCanvasId: 'main', width: 20, instance: { layoutMode: 'fill', overrides: { nodes: { layer: { text: 'test' } } } } };
    const host = { nodes: [node] };
    const next = switchVariantDocument(host, node.id, { canvasId: 'large' });
    expect(next.nodes[0]).toMatchObject({ sourceCanvasId: 'large', width: 20, instance: { layoutMode: 'fill' } });
    expect(next.nodes[0].instance.overrides?.nodes).toBeUndefined();
    expect(host.nodes[0]).toBe(node);
    expect(switchVariantDocument(host, node.id, source)).toBe(host);
  });
  it('rejects missing instances', () => expect(() => switchVariantDocument({ nodes: [] }, 'missing', source)).toThrow());
});
describe('variant property controls', () => {
  const variants = ['Size=Small, State=Idle', 'Size=Large, State=Idle', 'Size=Large, State=Hover'].map((variantName, i) => ({ canvasId: String(i), variantName }));
  it('parses whitespace and values containing equals', () => expect(parseVariantName(' Size = Large , State=Hover=On ')).toEqual({ Size: 'Large', State: 'Hover=On' }));
  it('falls back for plain, malformed, duplicate, or inconsistent properties', () => {
    for (const name of ['Default', 'Size=', 'Size=A, Size=B']) expect(parseVariantName(name)).toBeNull();
    expect(variantProperties([...variants, { variantName: 'Default' }])).toBeNull();
    expect(variantProperties([{ variantName: 'Size=A' }, { variantName: 'State=B' }])).toBeNull();
  });
  it('lists unique property values', () => expect(variantProperties(variants)).toEqual([{ key: 'Size', values: ['Small', 'Large'] }, { key: 'State', values: ['Idle', 'Hover'] }]));
  it('matches exact combinations and disables unavailable combinations', () => {
    expect(matchVariantProperty(variants, variants[0], 'Size', 'Large')).toBe(variants[1]);
    expect(matchVariantProperty(variants, variants[0], 'State', 'Hover')).toBeUndefined();
  });
});

describe('variant sets resolved from another canvas', () => {
  it('enumerates siblings stored in the source main document', () => {
    const main = createVariantDocument(source, source, 'Large', 'large');
    expect(componentVariants({ nodes: [] }, main).map(doc => doc.canvasId)).toEqual(['main', 'large']);
  });
});
