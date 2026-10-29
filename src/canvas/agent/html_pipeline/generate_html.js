import { UI_RULES } from './rules.js';
import { designSystemToCssVars } from '../design_system/apply.js';
import { stripFences } from './json_call.js';
const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
export function closeSnapshot(raw) {
  let html = stripFences(raw).replace(/<!--[^]*?(?:-->|$)/g, '');
  // Never expose an unfinished tag or raw CSS rule to the layout engine.
  const lastOpen = html.lastIndexOf('<');
  if (lastOpen > html.lastIndexOf('>')) html = html.slice(0, lastOpen);
  const stack = [];
  const tags = /<\/?([a-z][\w:-]*)\b[^>]*>/gi;
  for (const match of html.matchAll(tags)) {
    const name = match[1].toLowerCase();
    if (match[0][1] === '/') { const i = stack.lastIndexOf(name); if (i >= 0) stack.splice(i); }
    else if (!voids.has(name) && !match[0].endsWith('/>')) stack.push(name);
  }
  if (stack.includes('style') || stack.includes('script')) return null;
  if (!/<body\b/i.test(html)) return null;
  return html + stack.reverse().map(name => `</${name}>`).join('');
}
export function createSnapshotEmitter(onSnapshot, now = Date.now) {
  let last = -Infinity, valid = null;
  return { push(raw, final = false) {
    if (!final && now() - last < 300) return;
    const snapshot = closeSnapshot(raw);
    if (snapshot) valid = snapshot;
    if (valid) { last = now(); onSnapshot(valid, { final }); }
  }, get lastValid() { return valid; } };
}
export async function generateHtml({ brief, frame, direction, streamStep, config, signal, onSnapshot = () => {}, visualReferences = [] }) {
  const vars = designSystemToCssVars(direction.designSystem);
  const system = `Reconstruct the visual references as ONE complete self-contained HTML design, then refine it to match the written brief. Keep typography, layout, shapes, and controls editable. For photographs or complex illustrations that do not translate well to editable vectors, use separate div image slots with concise data-image-prompt values so they can become independent PNG layers. Exact viewport ${frame.width}x${frame.height}px. Use Tailwind utility classes for layout, spacing, colors and typography. The offline utility stylesheet is provided by the renderer. Reserve style blocks for :root CSS variables and rare custom styles unsupported by utilities. No JavaScript, network, CDN, imports, external fonts or images. Use local fallback fonts. CSS variables: ${JSON.stringify(vars)}. Define these on :root and use them. Body margin:0, fixed page dimensions. Real polished copy, every brief section in top-down order. Give EVERY element a unique stable data-voo-id. Nest flex/grid containers to produce editable auto-layout frames. Use absolute positioning only for overlays. ${UI_RULES} Direction: ${JSON.stringify(direction)}.`;
  const emitter = createSnapshotEmitter(onSnapshot);
  let buffer = '';
  const references = visualReferences.filter((image) => typeof image?.dataUrl === 'string' && image.dataUrl.startsWith('data:image/'));
  const userContent = references.length
    ? [
        { type: 'text', text: brief },
        ...references.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } })),
      ]
    : brief;
  const result = await streamStep({ config, messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }], tools: [], signal, onText: text => {
    // API transport emits accumulated text; CLI transport emits deltas.
    buffer = streamStep.textMode === 'delta' ? buffer + text : text.startsWith(buffer) ? text : buffer + text;
    emitter.push(buffer);
  } });
  signal?.throwIfAborted();
  const html = stripFences(result.text || buffer);
  if (!closeSnapshot(html)) throw new Error('Model did not return a complete HTML page');
  emitter.push(html, true);
  return { html, trace: [{ prompt: system, raw: html, errors: [] }] };
}
