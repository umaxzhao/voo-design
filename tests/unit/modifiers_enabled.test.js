import { describe, it, expect } from 'vitest';
import { addLinearArrayModifier, updateLinearArrayModifier } from '../../src/canvas/editor/doc-ops-linear-array.js';
import { addGridArrayModifier, updateGridArrayModifier } from '../../src/canvas/editor/doc-ops-grid-array.js';
import { addCircularArrayModifier, updateCircularArrayModifier } from '../../src/canvas/editor/doc-ops-circular-array.js';
import { evaluateLinearArrayModifiers } from '../../src/canvas/editor/scene-linear-array.js';
import { validateAndNormalizeModifierCollection } from '../../src/canvas/editor/scene-linear-array-validation.js';

import { serialiseDocument, deserialiseDocument } from '../../src/canvas/editor/scene_model_serialization.js';

const node = { id: 'source', kind: 'rect', x: 0, y: 0, width: 10, height: 10 };
describe.each([
  ['linear', addLinearArrayModifier, updateLinearArrayModifier],
  ['grid', addGridArrayModifier, updateGridArrayModifier],
  ['circular', addCircularArrayModifier, updateCircularArrayModifier],
])('%s modifier enabled state', (name, add, update) => {
  it('keeps parameters and serialization while disabling derived instances', () => {
    const original = add({ nodes: [node], modifiers: [] }, { targetId: node.id });
    const id = original.modifiers[0].id;
    expect(evaluateLinearArrayModifiers(original.nodes, original.modifiers).length).toBeGreaterThan(1);
    const disabled = update(original, id, { enabled: false });
    const restored = deserialiseDocument(JSON.parse(JSON.stringify(serialiseDocument({ ...disabled, width: 800, height: 600 }))));
    expect(validateAndNormalizeModifierCollection(restored.modifiers, restored.nodes)[0].enabled).toBe(false);
    expect(evaluateLinearArrayModifiers(restored.nodes, restored.modifiers)).toEqual(restored.nodes);
    const enabled = update(restored, id, { enabled: true });
    expect(evaluateLinearArrayModifiers(enabled.nodes, enabled.modifiers)).toEqual(evaluateLinearArrayModifiers(restored.nodes, original.modifiers));
    expect(original.modifiers[0].enabled).toBeUndefined();
  });
  it('rejects non-boolean enabled values and a second array on the target', () => {
    const doc = add({ nodes: [node], modifiers: [] }, { targetId: node.id });
    expect(() => update(doc, doc.modifiers[0].id, { enabled: 0 })).toThrow();
    expect(() => addLinearArrayModifier(doc, { targetId: node.id })).toThrow();
  });
});
