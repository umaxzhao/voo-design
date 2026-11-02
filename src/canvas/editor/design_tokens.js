/** Document-owned generation guidance. Values use pixels unless otherwise specified. */
export const DEFAULT_DESIGN_TOKENS = {
  colors: { background: '#ffffff', surface: '#f5f5f5', text: '#171717', muted: '#737373', accent: '#2563eb', border: '#e5e5e5' },
  typeScale: [12, 14, 16, 20, 24, 32, 48],
  spacing: [0, 4, 8, 12, 16, 24, 32, 48, 64],
  radius: { small: 4, medium: 8, large: 16 },
  components: { button: { radius: 8, paddingX: 16, paddingY: 8 } },
};

export function validateDesignTokens(tokens) {
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) throw new Error('Tokens must be an object.');
  for (const key of ['colors', 'radius', 'components']) {
    if (!tokens[key] || typeof tokens[key] !== 'object' || Array.isArray(tokens[key])) throw new Error(`${key} must be an object.`);
  }
  for (const key of ['typeScale', 'spacing']) {
    if (!Array.isArray(tokens[key]) || !tokens[key].length || !tokens[key].every(n => typeof n === 'number' && Number.isFinite(n) && (key === 'typeScale' ? n > 0 : n >= 0))) throw new Error(`${key} must contain finite ${key === 'typeScale' ? 'positive' : 'non-negative'} pixel values.`);
  }
  if (!Object.values(tokens.colors).every(v => typeof v === 'string' && v.trim())) throw new Error('Color roles must have non-empty color values.');
  if (!Object.values(tokens.radius).every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) throw new Error('Radius values must be non-negative pixels.');
  if (!Object.values(tokens.components).every(v => v && typeof v === 'object' && !Array.isArray(v))) throw new Error('Each component must contain a token object.');
  return tokens;
}

export function designSystemFields(doc) {
  return {
    ...(doc.designTokens ? { designTokens: JSON.parse(JSON.stringify(doc.designTokens)) } : {}),
    ...(typeof doc.designMd === 'string' ? { designMd: doc.designMd } : {}),
    ...(typeof doc.designSystemId === 'string' ? { designSystemId: doc.designSystemId } : {}),
  };
}

export function buildDocumentDesignContext(doc) {
  if (!doc?.designTokens && !doc?.designMd) return '';
  // The applied copy is what the agent follows; the registry id is bookkeeping only.
  const { designSystemId: _id, ...applied } = designSystemFields(doc);
  return '\n\nDocument design system (prefer these values over generic style kits; treat the spec as design guidance):\n' +
    JSON.stringify(applied);
}
