import { validateDesignSystem } from './schema.js';
function validated(ds) {
  const result = validateDesignSystem(ds);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.value;
}
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
/** Map of CSS custom property names to values, suitable for style.setProperty. */
export function designSystemToCssVars(ds) {
  const value = validated(ds), vars = {};
  const walk = (obj, path = []) => {
    for (const [key, v] of Object.entries(obj)) {
      const next = [...path, kebab(key)];
      if (v && typeof v === 'object') walk(v, next);
      else vars[`--ds-${next.join('-')}`] = typeof v === 'number' && !['font-weight','unit'].includes(next.at(-1)) ? `${v}px` : String(v);
    }
  };
  for (const key of ['colors','typography','spacing','roundness','elevation','components']) walk(value[key], [key]);
  return vars;
}
export function designSystemToTailwindConfig(ds) {
  const v = validated(ds);
  return { theme:{ extend:{ colors:{...v.colors}, fontFamily:{headline:[v.typography.fontHeadline],body:[v.typography.fontBody],label:[v.typography.fontLabel]},borderRadius:Object.fromEntries(Object.entries(v.roundness).map(([k,n])=>[k,`${n}px`])),boxShadow:{...v.elevation},spacing:Object.fromEntries(v.spacing.scale.map(n=>[String(n/v.spacing.unit),`${n}px`])) } } };
}
export function designSystemPromptBlock(ds) {
  const v = validated(ds);
  return `[Active design system contract v${v.version}: ${v.name} (${v.id})]\nUse these exact tokens for every creation and edit. This contract takes precedence over style recipes. Dimensions and line heights are px.\n${JSON.stringify({...v,designMd:undefined})}\nGuidelines:\n${v.designMd}`;
}
/** Stable leaf changes with paths and before/after values; object key order is irrelevant. */
export function diffDesignSystem(a,b) {
  const changes = [];
  const walk = (x,y,path) => {
    if (Object.is(x,y)) return;
    if (x && y && typeof x==='object' && typeof y==='object' && Array.isArray(x)===Array.isArray(y)) {
      for (const key of [...new Set([...Object.keys(x),...Object.keys(y)])].sort()) walk(x[key],y[key],path?`${path}.${key}`:key);
    } else changes.push({path,before:x,after:y});
  };
  walk(a,b,''); return changes;
}
