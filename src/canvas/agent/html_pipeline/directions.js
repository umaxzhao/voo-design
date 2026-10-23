import { callJson } from './json_call.js';
import { validateDesignSystem } from '../design_system/schema.js';
import { DESIGN_SYSTEM_PRESETS } from '../design_system/from_style_kit.js';
export function validateDirections(value) {
  const errors = [];
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) return { ok: false, errors: ['Expected 2–3 directions'] };
  const ids = new Set();
  const directions = value.map((d, i) => {
    for (const k of ['id', 'name', 'mood', 'layoutIdea']) if (typeof d?.[k] !== 'string' || !d[k].trim()) errors.push(`${i}.${k}: required string`);
    if (ids.has(d?.id)) errors.push('Direction IDs must be unique'); ids.add(d?.id);
    const ds = validateDesignSystem(d?.designSystem); errors.push(...ds.errors.map(e => `${i}.${e}`));
    return { ...d, designSystem: ds.value };
  });
  return { ok: !errors.length, value: directions, errors };
}
export async function createDirections(options) {
  return callJson({ ...options, system: `Art direct a finished page. Return an array of 2–3 visually distinct directions: {id,name,mood,layoutIdea,designSystem}. Each designSystem must follow this complete v1 contract. Preset examples: ${JSON.stringify(Object.values(DESIGN_SYSTEM_PRESETS).slice(0, 3))}`, user: options.brief, validate: validateDirections });
}
export function pickDirection(directions, choice = 'auto') {
  if (!directions.length) throw new Error('No visual directions');
  if (choice === 'auto' || choice == null) return directions[0];
  const picked = directions.find(d => d.id === (choice.id ?? choice));
  if (!picked) throw new Error(`Unknown direction: ${choice}`);
  return picked;
}
