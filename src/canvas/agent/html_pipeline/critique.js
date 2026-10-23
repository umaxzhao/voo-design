import { runAntiAiChecks } from './anti_ai_checks.js';
import { UI_RULES } from './rules.js';
import { callJson } from './json_call.js';
export function validateCritique(value) {
  const ok = Number.isInteger(value?.score) && value.score >= 1 && value.score <= 5 && Array.isArray(value.issues) && value.issues.every(i => ['id', 'problem', 'fix'].every(k => typeof i?.[k] === 'string' && i[k].trim()));
  return { ok, value, errors: ok ? [] : ['Expected {score: integer 1–5, issues:[{id,problem,fix}]}'] };
}
export function validatePatches(value) {
  const ok = Array.isArray(value?.patches) && value.patches.length <= 20 && value.patches.every(p => typeof p?.id === 'string' && p.id && typeof p.html === 'string' && p.html.trim());
  return { ok, value, errors: ok ? [] : ['Expected {patches:[{id,html}]} (at most 20)'] };
}
export function splicePatches(html, patches, Parser = globalThis.DOMParser) {
  const doc = new Parser().parseFromString(html, 'text/html');
  const targets = new Map();
  for (const patch of patches) {
    if (targets.has(patch.id)) throw new Error(`Duplicate patch: ${patch.id}`);
    const matches = Array.from(doc.querySelectorAll('[data-voo-id]')).filter(el => el.dataset.vooId === patch.id);
    if (matches.length !== 1) throw new Error(`Patch target must exist exactly once: ${patch.id}`);
    const template = doc.createElement('template'); template.innerHTML = patch.html.trim();
    const replacement = template.content.firstElementChild;
    if (template.content.children.length !== 1 || !replacement || replacement.dataset.vooId !== patch.id) throw new Error(`Patch must preserve data-voo-id: ${patch.id}`);
    targets.set(patch.id, { target: matches[0], replacement });
  }
  const entries = [...targets.values()];
  if (entries.some(a => entries.some(b => a !== b && a.target.contains(b.target)))) throw new Error('Overlapping patch targets');
  for (const { target, replacement } of entries) target.replaceWith(replacement);
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
export async function exportFramePng(editor, frameId) {
  const frame = editor.getNode?.(frameId);
  if (frame && editor.exportRectPng) {
    const regional = await editor.exportRectPng(frame);
    if (regional) return regional;
  }
  const canvas = await (editor.exportPngCanvas?.() ?? editor.renderComposite?.());
  if (!canvas?.toDataURL) throw new Error('Canvas PNG export unavailable');
  return canvas.toDataURL('image/png');
}
export async function critiqueHtml({ editor, frameId, brief, html, frame, streamStep, config, signal }) {
  const checks = runAntiAiChecks({ html, frame });
  const image = await exportFramePng(editor, frameId);
  const review = await callJson({ streamStep, config, signal, system: UI_RULES + ' Critique this finished canvas design for hierarchy, legibility, clipping, brief coverage and visual polish. Return {score:1..5,issues:[{id: data-voo-id,problem,fix}]}. Only actionable issues; 4 means ready.', user: [{ type: 'text', text: `Brief: ${brief}\nHTML: ${html}\nDeterministic checks: ${JSON.stringify(checks)}` }, { type: 'image_url', image_url: { url: image } }], validate: validateCritique });
  if (!checks.hardFail && review.value.score - checks.verbosityPenalty >= 4) return { html, trace: review.trace, repaired: false };
  const repair = await callJson({ streamStep, config, signal, system: UI_RULES + ' Return {patches:[{id,html}]} for ONE targeted repair. Each html is a single full replacement element preserving its data-voo-id. No overlapping targets. Retain all other content and styling.', user: JSON.stringify({ brief, html, issues: [...review.value.issues, ...checks.issues] }), validate: value => {
    const result = validatePatches(value);
    if (!result.ok) return result;
    try { splicePatches(html, value.patches); return result; }
    catch (error) { return { ok: false, errors: [error.message] }; }
  } });
  return { html: splicePatches(html, repair.value.patches), trace: [...review.trace, ...repair.trace], repaired: true };
}
