import { DESIGN_TOKENS, contrastRatio, nearestTypeSize } from './tokens.js';

const kind = n => n.kind ?? n.type;
const area = n => Math.max(0, n.width || 0) * Math.max(0, n.height || 0);
const contains = (a, b) => b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
const intersects = (a, b) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
const fill = n => { const f = n.fills?.find(f => f.visible !== false) ?? n.fill; return typeof f === 'string' ? f : f?.color; };
const values = v => typeof v === 'number' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(values) : [];
const weights = { missingAutoLayout: 7, overlap: 10, overflow: 10, misalignment: 4, offGrid: 4, typeScale: 7, contrast: 12, radii: 5, purpleGradient: 12, identicalCards: 10, centerStackedHero: 10, decorativeLines: 7, evenTemplateSpacing: 6, flatHierarchy: 10, noFocal: 8 };

/** Axis-aligned heuristics on editor world coordinates. Intentional overlaps and
 * decorative motifs are warnings to review, not a claim about visual intent. */
export function lintDesign(doc, { rootId, kit } = {}) {
  const all = (doc?.nodes ?? []).filter(Boolean);
  const byId = new Map(all.map(n => [n.id, n]));
  const parents = new Map(all.map(n => [n.id, n.parentId]));
  for (const n of all) for (const child of n.children ?? []) {
    const id = typeof child === 'object' ? child.id : child;
    if (!parents.get(id)) parents.set(id, n.id);
  }
  const ancestry = n => { const result = []; const seen = new Set([n.id]); let id = parents.get(n.id); while (byId.has(id) && !seen.has(id)) { seen.add(id); result.push(byId.get(id)); id = parents.get(id); } return result; };
  const nodes = all.filter(n => n.visible !== false && !ancestry(n).some(p => p.visible === false) && (!rootId || n.id === rootId || ancestry(n).some(p => p.id === rootId)));
  const children = new Map();
  for (const n of nodes) { const p = parents.get(n.id) ?? null; if (!children.has(p)) children.set(p, []); children.get(p).push(n); }
  const container = n => ['group', 'frame', 'region', 'boolean'].includes(kind(n)) || children.has(n.id);
  const issues = [];
  const add = (rule, ns, message, fix, severity = 'warn') => issues.push({ rule, severity, nodeIds: ns.map(n => n.id).filter(id => id != null), message, fix });
  const gaps = [];
  for (const n of nodes) {
    // Reuse visible, scoped direct children; decoration alone is not composed UI.
    const frame = ['frame', 'group'].includes(kind(n)) || n.isFrame === true || n.frame === true || n.containerType === 'frame';
    const contentChildren = (children.get(n.id) ?? []).filter(c => !['line', 'path'].includes(kind(c)) && c.structural !== true);
    const direction = n.autoLayout?.direction ?? n.layout;
    if (frame && contentChildren.length >= 2 && !['horizontal', 'vertical'].includes(direction)) {
      add('missingAutoLayout', [n], 'Composed frame lacks auto-layout; review intentional absolute compositions.', 'Enable horizontal/vertical auto-layout with a 4-multiple gap and padding unless absolute placement is intentional.');
    }
    const p = byId.get(parents.get(n.id));
    if (p && container(p) && !contains(p, n)) add('overflow', [n, p], 'Child extends outside its parent bounds.', 'Resize or reposition the child inside the frame.', 'error');
    const spacing = ['gap', 'crossGap', 'padding', 'spacing'].flatMap(key => values(n.autoLayout?.[key] ?? n[key]));
    if (spacing.some(v => Number.isFinite(v) && Math.abs(v / 4 - Math.round(v / 4)) > 0.001)) add('offGrid', [n], 'Spacing is off the 4px grid.', 'Snap padding and gaps to multiples of 4.');
    if (n.autoLayout?.gap > 0) gaps.push(n.autoLayout.gap);
    const gradients = [n.gradient, ...(n.fills ?? []).filter(f => /gradient/i.test(f.type ?? '') || f.stops)];
    for (const gradient of gradients.filter(Boolean)) {
      const colors = JSON.stringify(gradient).match(/#[0-9a-f]{6}\b|purple|violet|blue|pink/gi) ?? [];
      const hues = colors.map(c => { if (!c.startsWith('#')) return c.toLowerCase(); const [r,g,b] = [1,3,5].map(i => parseInt(c.slice(i,i+2),16)); return b > g * 1.2 && r > g * 1.2 && b > 90 ? (r > b * 1.3 ? 'pink' : 'purple') : b > r * 1.2 && b > g * 1.1 ? 'blue' : null; });
      if (hues.some(h => h === 'purple' || h === 'violet') && hues.some(h => h === 'blue' || h === 'pink')) { add('purpleGradient', [n], 'Purple to blue/pink gradient reads as a generic template.', 'Use a restrained solid palette with one signal accent.'); break; }
    }
  }
  for (const siblings of children.values()) {
    for (let i = 0; i < siblings.length; i++) for (let j = i + 1; j < siblings.length; j++) {
      const a = siblings[i], b = siblings[j];
      // A containing rect commonly supplies a button/card background.
      if (!container(a) && !container(b) && intersects(a,b) && !contains(a,b) && !contains(b,a)) add('overlap', [a,b], 'Sibling content overlaps.', 'Separate content or group intentional layered elements.', 'error');
      const dx = Math.abs(a.x - b.x);
      if (dx >= 1 && dx <= 3) add('misalignment', [a,b], 'Left edges almost align.', 'Align these left edges exactly.');
    }
    const cards = new Map();
    for (const n of siblings.filter(n => ['rect','frame','group'].includes(kind(n)) && area(n) > 0)) {
      const key = JSON.stringify([n.width,n.height,n.cornerRadius ?? 0,fill(n)]);
      if (!cards.has(key)) cards.set(key, []); cards.get(key).push(n);
    }
    for (const group of cards.values()) if (group.length >= 3) add('identicalCards', group, 'Three or more identical sibling cards create a template grid.', 'Emphasize one module with larger area and vary content structure.');
    const content = siblings.filter(n => kind(n) === 'text' || ['rect','frame','group'].includes(kind(n)));
    const texts = content.filter(n => kind(n) === 'text');
    if (texts.length >= 2 && content.length >= 3 && Math.max(...texts.map(n => n.fontSize || 16)) >= 30) {
      const centers = content.map(n => n.x + n.width / 2);
      const ordered = [...content].sort((a,b) => a.y - b.y);
      if (Math.max(...centers) - Math.min(...centers) <= 3 && ordered.every((n,i) => !i || n.y >= ordered[i-1].y + ordered[i-1].height)) add('centerStackedHero', content, 'Headline, supporting copy and CTA form a centered stack.', 'Use an asymmetric hero with a left headline and a dominant product visual.');
    }
    const peers = siblings.filter(n => kind(n) !== 'text' && !['line','path'].includes(kind(n)) && area(n) > 0);
    if (peers.length >= 3) { const sorted = peers.map(area).sort((a,b) => b-a); if (sorted[0] < sorted[1] * 2) add('noFocal', peers, 'No module has twice the area of its peers.', 'Make one primary module at least twice the area of secondary modules.'); }
  }
  const texts = nodes.filter(n => kind(n) === 'text');
  const sizes = [...new Set(texts.map(n => n.fontSize ?? 16))].sort((a,b) => a-b);
  const scale = DESIGN_TOKENS.typeScale;
  for (const n of texts) {
    const size = n.fontSize ?? 16;
    if (!scale.includes(size)) add('typeScale', [n], `Font size ${size}px is outside the token scale.`, `Use ${nearestTypeSize(size)}px.`);
    // Paint-order background: containing siblings painted earlier, then ancestors.
    const index = all.indexOf(n);
    const backgrounds = all.slice(0,index).filter(b => b.visible !== false && kind(b) !== 'text' && contains(b,n) && fill(b) && (parents.get(b.id) === parents.get(n.id) || ancestry(n).includes(b)));
    const bg = fill(backgrounds.at(-1) ?? {}) ?? ancestry(n).map(fill).find(Boolean) ?? doc?.backgroundColor ?? kit?.palette?.bg ?? '#ffffff';
    const fg = fill(n) ?? '#000000';
    const ratio = contrastRatio(fg,bg);
    const required = size >= 24 || (size >= 18.66 && Number(n.fontWeight) >= 700) ? 3 : 4.5;
    if (ratio > 0 && ratio < required) add('contrast', [n], `Text contrast ${ratio.toFixed(2)} is below ${required}:1.`, 'Increase text/background luminance contrast.', 'error');
  }
  if (sizes.length > 5) add('typeScale', texts, 'More than five text sizes create a chaotic hierarchy.', 'Reduce to at most five roles on the shared scale.');
  const radii = [...new Set(nodes.flatMap(n => values(n.cornerRadii ?? n.cornerRadius)).filter(v => v > 0))];
  if (radii.length > 3) add('radii', nodes.filter(n => n.cornerRadius || n.cornerRadii), 'More than three corner radii are in use.', 'Choose at most three radius tokens.');
  const decorations = nodes.filter(n => !container(n) && (['line','path','ellipse'].includes(kind(n)) || Math.min(n.width,n.height) <= 3) && !n.structural && !/divider|separator|rule|chart|icon/i.test(n.name ?? ''));
  if (decorations.length > 3) add('decorativeLines', decorations, 'Excess non-structural lines or shapes distract from content.', 'Remove decoration that does not communicate structure or data.');
  if (gaps.length >= 3 && new Set(gaps).size === 1) add('evenTemplateSpacing', nodes.filter(n => n.autoLayout?.gap > 0), 'Every layout group uses the same gap.', 'Use tight spacing inside groups and larger gaps between sections.');
  const body = sizes.length ? texts.map(n => n.fontSize ?? 16).sort((a,b) => a-b)[Math.floor((texts.length-1)/2)] : 0;
  const root = rootId ? byId.get(rootId) : null;
  const canvasArea = root ? area(root) : (doc?.width || 0) * (doc?.height || 0);
  const occupied = nodes.filter(n => n !== root && !container(n)).reduce((sum,n) => sum + area(n),0);
  if ((texts.length >= 2 && sizes.at(-1) < body * 2) || (nodes.length > 0 && canvasArea > 0 && occupied / canvasArea < 0.08)) add('flatHierarchy', texts.length ? texts : nodes, 'The composition lacks a strong typographic or visual focal point.', 'Increase headline/body scale contrast and give the primary content more visual weight.');
  const counts = {};
  for (const issue of issues) counts[issue.rule] = (counts[issue.rule] || 0) + 1;
  const penalty = Object.entries(counts).reduce((sum,[rule,count]) => sum + weights[rule] * Math.min(count,3),0);
  return { score: Math.max(0,100-penalty), issues, metrics: { nodeCount: nodes.length, typeSizeCount: sizes.length, fontSizes: sizes, radiusCount: radii.length, ruleCounts: counts, penalty, rootFound: !rootId || byId.has(rootId) } };
}
