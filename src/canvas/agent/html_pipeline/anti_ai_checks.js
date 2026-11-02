// Deterministic source checks run before approval and again after repair.
// A tiny source tree keeps these checks usable in workers and unit tests too.
function sourceTree(html) {
  const root = { tag: '', attrs: '', text: '', children: [] }, stack = [root];
  for (const token of html.replace(/<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1>/gi, '').match(/<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (token.startsWith('<')) {
      const m = token.match(/^<([\w-]+)\b([^>]*)>/); if (!m) continue;
      const node = { tag: m[1].toLowerCase(), attrs: m[2], text: '', children: [], parent: stack.at(-1) };
      node.parent.children.push(node);
      if (!/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(node.tag) && !token.endsWith('/>')) stack.push(node);
    } else for (const node of stack) node.text += token.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n))).replace(/&\w+;/g, ' ');
  }
  return root;
}
export function runAntiAiChecks({ html, frame } = {}) {
  const root = sourceTree(html || ''), issues = [];
  const add = (node, problem, hard = false) => issues.push({ id: node.attrs?.match(/data-voo-id\s*=\s*["']([^"']+)/i)?.[1] || '', problem, fix: hard ? 'Remove decorative icons; retain functional monochrome Lucide icons only.' : 'Shorten copy and remove filler subtitles.', hard });
  if (/\p{Extended_Pictographic}|[\u2605\u2606\u2726\u2727]/u.test(root.text)) add(root, 'Decorative emoji or stars', true);
  function walk(node) {
    if (/data-lucide\s*=\s*["']?(?:sparkles|wand(?:-sparkles|-2)?|party-popper)\b/i.test(node.attrs)) add(node, 'Decorative Lucide icon', true);
    if (node.tag === 'svg') {
      const fills = new Set();
      const collect = n => { for (const m of n.attrs.matchAll(/(?:\bfill\s*=\s*["']|\bfill\s*:\s*)([^"';\s>]+)/gi)) if (!/^(none|transparent|currentColor|inherit)$/i.test(m[1])) fills.add(m[1].toLowerCase()); n.children.forEach(collect); };
      collect(node); if (fills.size > 1) add(node, 'Multi-fill colored SVG', true);
    }
    const heading = n => /^h[1-6]$/.test(n.tag);
    const icon = n => ['svg', 'i'].includes(n.tag) || n.children.some(icon);
    const colored = /(?:bg-(?!white\b|black\b|transparent\b|gray\b|slate\b|neutral\b|zinc\b|stone\b)[a-z]+-\d|background(?:-color)?\s*:\s*(?!transparent\b|none\b)[^;]+)/i;
    if (icon(node) && colored.test(node.attrs) && node.parent?.children.some(heading)) add(node, 'Colored icon tile beside heading', true);
    const words = node.text.trim().split(/\s+/).filter(Boolean).length;
    if (heading(node) && words > 5) add(node, 'Heading exceeds five words');
    if (node.tag === 'p' && words > 20) add(node, 'Paragraph exceeds twenty words');
    if (node.tag === 'p' && node.parent?.children.some(heading) && /\b(?:everything you need|all (?:your|the|of your)|stay (?:on top|organized|connected)|at a glance|seamlessly|effortlessly|unlock|take .* next level|manage .* (?:ease|place)|get started|discover|explore)\b/i.test(node.text)) add(node, 'Filler card subtitle');
    node.children.forEach(walk);
  }
  root.children.forEach(walk);
  return { hardFail: issues.some(i => i.hard), verbosityPenalty: issues.filter(i => !i.hard).length, issues, frame };
}
