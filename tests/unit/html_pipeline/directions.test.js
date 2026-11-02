import { expect, it } from 'vitest';
import { validateDirections, pickDirection } from '../../../src/canvas/agent/html_pipeline/directions.js';
import { DESIGN_SYSTEM_PRESETS } from '../../../src/canvas/agent/design_system/from_style_kit.js';
const directions = () => Object.values(DESIGN_SYSTEM_PRESETS).slice(0, 2).map((designSystem, i) => ({ id: String(i), name: designSystem.name, mood: 'calm', layoutIdea: 'editorial', designSystem }));
it('validates complete preset contracts and picks explicit or auto direction', () => {
  const result = validateDirections(directions()); expect(result.ok).toBe(true);
  expect(pickDirection(result.value).id).toBe('0'); expect(pickDirection(result.value, '1').id).toBe('1');
  expect(() => pickDirection(result.value, 'missing')).toThrow();
});
it('rejects missing tokens, duplicate IDs and invalid counts', () => {
  const values = directions(); values[0].designSystem = {}; expect(validateDirections(values).ok).toBe(false);
  const duplicates = directions(); duplicates[1].id = duplicates[0].id; expect(validateDirections(duplicates).ok).toBe(false);
  expect(validateDirections([]).ok).toBe(false); expect(validateDirections([null, null]).ok).toBe(false);
});
