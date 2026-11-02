import { contrastRatio } from '../design_quality/tokens.js';
import { GOOGLE_FONT_INDEX } from '../../editor/google_fonts_index.js';

export const DESIGN_SYSTEM_VERSION = 1;
export const COLOR_ROLES = 'primary onPrimary secondary onSecondary tertiary onTertiary neutral surface surfaceVariant onSurface onSurfaceVariant outline error onError background'.split(' ');
export const FONT_ROLES = 'displayLg headlineLg headlineMd titleMd bodyLg bodyMd labelLg labelSm'.split(' ');
const fonts = new Set([...GOOGLE_FONT_INDEX.map(([name]) => name.toLowerCase()), 'departuremono', 'arial', 'georgia', 'system-ui', 'sans-serif', 'serif', 'monospace']);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Numeric dimensions are px, including lineHeight and letterSpacing.
 * Bounds: type 8..200, line height 8..300, weight 100..1000, tracking -10..30,
 * spacing 0..1024, radii 0..9999, component padding/height <=256, borders <=16.
 * Unknown keys are stripped; warnings never invalidate a contract. Invalid values return null.
 */
export function validateDesignSystem(obj) {
  const errors = [], warnings = [];
  const fail = (path, expected) => errors.push(`${path}: expected ${expected}`);
  const record = (v, path) => { if (!object(v)) fail(path, 'object'); return object(v) ? v : {}; };
  const str = (v, path, max = 200) => { if (typeof v !== 'string' || !v.trim() || v.length > max) { fail(path, `non-empty string <= ${max} characters`); return ''; } return v.trim(); };
  const num = (v, path, min, max) => { if (!Number.isFinite(v) || v < min || v > max) { fail(path, `number ${min}..${max}`); return 0; } return v; };
  const input = record(obj, 'designSystem');
  if (input.version !== DESIGN_SYSTEM_VERSION) fail('version', '1');
  if (!['light', 'dark'].includes(input.colorMode)) fail('colorMode', 'light or dark');
  const value = { version: 1, id: str(input.id, 'id'), name: str(input.name, 'name'), colorMode: input.colorMode };
  const colors = record(input.colors, 'colors');
  value.colors = Object.fromEntries(COLOR_ROLES.map(key => {
    const c = colors[key];
    if (typeof c !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c.trim())) { fail(`colors.${key}`, '#rgb or #rrggbb'); return [key, '']; }
    let hex = c.trim().slice(1); if (hex.length === 3) hex = [...hex].map(x => x + x).join('');
    return [key, `#${hex.toUpperCase()}`];
  }));
  const type = record(input.typography, 'typography');
  value.typography = {};
  for (const key of ['fontHeadline', 'fontBody', 'fontLabel']) {
    const font = str(type[key], `typography.${key}`); value.typography[key] = font;
    if (font && !fonts.has(font.toLowerCase())) warnings.push(`typography.${key}: unknown font "${font}" (preserved)`);
  }
  const scale = record(type.scale, 'typography.scale');
  value.typography.scale = Object.fromEntries(FONT_ROLES.map(key => {
    const role = record(scale[key], `typography.scale.${key}`);
    return [key, Object.fromEntries(Object.entries({ fontSize: [8, 200], lineHeight: [8, 300], fontWeight: [100, 1000], letterSpacing: [-10, 30] }).map(([prop, bounds]) => [prop, num(role[prop], `typography.scale.${key}.${prop}`, ...bounds)]))];
  }));
  const spacing = record(input.spacing, 'spacing');
  if (![4, 8].includes(spacing.unit)) fail('spacing.unit', '4 or 8');
  if (!Array.isArray(spacing.scale) || !spacing.scale.length || spacing.scale.length > 100) fail('spacing.scale', '1..100 numbers');
  value.spacing = { unit: spacing.unit, scale: Array.isArray(spacing.scale) ? [...new Set(spacing.scale.map((n, i) => num(n, `spacing.scale.${i}`, 0, 1024)))].sort((a, b) => a - b) : [] };
  const radius = record(input.roundness, 'roundness');
  value.roundness = Object.fromEntries(['none', 'sm', 'md', 'lg', 'full'].map(k => [k, num(radius[k], `roundness.${k}`, 0, 9999)]));
  const elevation = record(input.elevation, 'elevation');
  value.elevation = {};
  for (const k of ['sm', 'md']) {
    const s = str(elevation[k], `elevation.${k}`, 500);
    const length = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:px)?';
    const color = '(?:#[0-9a-fA-F]{3,8}|rgba?\\([\\d.,%\\s]+\\)|hsla?\\([\\d.,%\\s]+\\)|black|white|transparent|currentColor)';
    const shadow = new RegExp(`^(?:inset\\s+)?${length}\\s+${length}(?:\\s+${length}){0,2}(?:\\s+${color})?(?:\\s+inset)?$`);
    const layers = s.split(/,(?![^()]*\))/);
    if (s !== 'none' && !layers.every(layer => shadow.test(layer.trim()))) fail(`elevation.${k}`, 'CSS box-shadow');
    value.elevation[k] = s;
  }
  const components = record(input.components, 'components'); value.components = {};
  for (const [name, props] of Object.entries({ button: {radius:9999,paddingX:256,paddingY:256}, card:{radius:9999,padding:256}, input:{radius:9999,height:256,border:16}, chip:{radius:9999} })) {
    const c = record(components[name], `components.${name}`);
    value.components[name] = Object.fromEntries(Object.entries(props).map(([k, max]) => [k, num(c[k], `components.${name}.${k}`, k === 'height' ? 16 : 0, max)]));
    if (name === 'button') { if (!FONT_ROLES.includes(c.fontRole)) fail('components.button.fontRole', 'typography scale role'); value.components.button.fontRole = c.fontRole; }
    if (name === 'card') { if (!['none', 'sm', 'md'].includes(c.elevation)) fail('components.card.elevation', 'none, sm or md'); value.components.card.elevation = c.elevation; }
  }
  if (typeof input.designMd !== 'string' || input.designMd.length > 4000) fail('designMd', 'string <= 4000 characters');
  value.designMd = typeof input.designMd === 'string' ? input.designMd : '';
  if (!errors.length) warnings.push(...checkContrast(value));
  return { ok: !errors.length, value: errors.length ? null : value, errors, warnings };
}

/** WCAG AA normal-text threshold (4.5:1); surface text also applies to background. */
export function checkContrast(ds) {
  return [['onPrimary','primary'],['onSecondary','secondary'],['onTertiary','tertiary'],['onSurface','surface'],['onSurfaceVariant','surfaceVariant'],['onError','error'],['onSurface','background']].flatMap(([on, base]) => {
    const ratio = contrastRatio(ds?.colors?.[on], ds?.colors?.[base]);
    return ratio < 4.5 ? [`colors.${on}/${base}: contrast ${ratio.toFixed(2)}:1 is below WCAG AA 4.5:1`] : [];
  });
}
