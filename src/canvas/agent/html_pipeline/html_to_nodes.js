const number = (s, fallback = 0) => Number.parseFloat(s) || fallback;
const visibleColor = s => s && s !== 'transparent' && s !== 'rgba(0, 0, 0, 0)';
export function elementKey(el) {
  if (el.dataset?.vooId) return el.dataset.vooId;
  return el.parentElement ? `${elementKey(el.parentElement)}/${el.tagName.toLowerCase()}:${Array.from(el.parentElement.children).indexOf(el)}` : el.tagName.toLowerCase();
}
export function htmlToNodes(doc, frame = {}) {
  const nodes = [], view = doc.defaultView;
  function walk(el) {
    if (['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD'].includes(el.tagName)) return;
    const css = view.getComputedStyle(el), r = el.getBoundingClientRect();
    if (css.display === 'none' || css.visibility === 'hidden' || css.opacity === '0') return;
    const key = elementKey(el), base = { name: el.getAttribute('aria-label') || el.dataset?.vooId || el.tagName.toLowerCase(), x: r.x + (frame.x || 0), y: r.y + (frame.y || 0), width: r.width, height: r.height, opacity: css.opacity === '' ? 1 : Math.max(0, Math.min(1, Number(css.opacity))) };
    const gradient = css.backgroundImage?.startsWith('linear-gradient') ? css.backgroundImage : null;
    const imagePrompt = el.dataset?.imagePrompt;
    const isSvg = el.tagName.toLowerCase() === 'svg';
    if (r.width > 0 && r.height > 0 && (visibleColor(css.backgroundColor) || number(css.borderWidth) || gradient || imagePrompt || isSvg)) {
      const path = isSvg && el.children.length === 1 && el.firstElementChild.tagName.toLowerCase() === 'path' && !el.firstElementChild.hasAttribute('transform') && !el.hasAttribute('viewBox') ? el.firstElementChild : null;
      const node = { ...base, key, htmlKey: key, type: path ? 'path' : css.borderRadius === '50%' ? 'ellipse' : 'rect', fill: (gradient ? css.backgroundImage : null) || (visibleColor(css.backgroundColor) ? css.backgroundColor : imagePrompt ? '#E5E7EB' : isSvg ? css.color || '#888888' : 'none'), stroke: number(css.borderWidth) ? css.borderColor : 'none', strokeWidth: number(css.borderWidth), cornerRadius: number(css.borderRadius), shadow: { enabled: false } };
      if (path) { node.d = path.getAttribute('d'); node.fill = path.getAttribute('fill') || css.fill || css.color; }
      if (imagePrompt) node.imagePrompt = imagePrompt;
      if (css.boxShadow && css.boxShadow !== 'none') {
        const color = css.boxShadow.match(/rgba?\([^)]*\)|#[\da-f]+/i)?.[0] || '#000000';
        const lengths = css.boxShadow.replace(color, '').match(/-?[\d.]+px/g)?.map(Number.parseFloat) || [];
        node.shadow = { enabled: true, color, offsetX: lengths[0] || 0, offsetY: lengths[1] || 0, blur: lengths[2] || 0, opacity: 1 };
      }
      nodes.push(node);
    }
    if (isSvg) return;
    Array.from(el.childNodes).forEach((child, index) => {
      if (child.nodeType === 1) return walk(child);
      if (child.nodeType !== 3 || !child.textContent.trim()) return;
      const range = doc.createRange(); range.selectNodeContents(child);
      const rects = Array.from(range.getClientRects?.() || []);
      const rect = range.getBoundingClientRect?.() || rects[0];
      if (!rect || !rect.width || !rect.height) return;
      nodes.push({ ...base, key: `${key}/text:${index}`, htmlKey: `${key}/text:${index}`, type: 'text', x: rect.x + (frame.x || 0), y: rect.y + (frame.y || 0), width: rect.width, height: rect.height, text: css.whiteSpace?.startsWith('pre') ? child.textContent : child.textContent.replace(/\s+/g, ' '), fontFamily: css.fontFamily, fontSize: number(css.fontSize, 16), fontWeight: css.fontWeight || '400', fill: css.color, letterSpacing: number(css.letterSpacing), lineHeight: number(css.lineHeight, number(css.fontSize, 16) * 1.2) / number(css.fontSize, 16), align: ['center', 'right'].includes(css.textAlign) ? css.textAlign : 'left' });
    });
  }
  walk(doc.body);
  return nodes;
}
