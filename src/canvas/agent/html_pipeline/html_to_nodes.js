const number = (s, fallback = 0) => Number.parseFloat(s) || fallback;
const visibleColor = s => {
  if (!s || s === 'transparent') return false;
  const alpha = s.match(/(?:rgba|hsla)\([^)]*[,/]\s*([\d.]+)(%)?\s*\)$/i);
  return !alpha || Number(alpha[1]) > 0;
};
const inlineTags = new Set(['SPAN', 'A', 'B', 'STRONG', 'EM', 'I', 'SMALL', 'BR', 'U']);
const textContent = (el, pre = false) => Array.from(el.childNodes || []).map(c => c.nodeType === 3 ? (pre ? c.textContent : c.textContent.replace(/\s+/g, ' ')) : c.tagName === 'BR' ? '\n' : textContent(c, pre)).join('');
export function elementKey(el) {
  if (el.dataset?.vooId) return el.dataset.vooId;
  return el.parentElement ? `${elementKey(el.parentElement)}/${el.tagName.toLowerCase()}:${Array.from(el.parentElement.children).indexOf(el)}` : el.tagName.toLowerCase();
}
export function htmlToNodes(doc, frame = {}) {
  const nodes = [], view = doc.defaultView;
  function walk(el, suppressText = false, inheritedOpacity = 1) {
    if (['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD'].includes(el.tagName)) return;
    const css = view.getComputedStyle(el), r = el.getBoundingClientRect();
    if (css.display === 'none' || css.visibility === 'hidden' || Number.parseFloat(css.opacity) === 0) return;
    const key = elementKey(el), base = { name: el.getAttribute('aria-label') || el.dataset?.vooId || el.tagName.toLowerCase(), x: Math.round(r.x + (frame.x || 0)), y: Math.round(r.y + (frame.y || 0)), width: Math.ceil(r.width), height: Math.ceil(r.height), opacity: inheritedOpacity * ( css.opacity === '' ? 1 : Math.max(0, Math.min(1, Number(css.opacity || 1)))) };
    const gradient = /^(linear|radial)-gradient\(/.test(css.backgroundImage || '') ? css.backgroundImage : null;
    const textClip = (css.backgroundClip || css.webkitBackgroundClip) === 'text';
    // Masks and blurred glows cannot be represented as a plain opaque rectangle.
    const decoration = (css.maskImage && css.maskImage !== 'none') || (css.webkitMaskImage && css.webkitMaskImage !== 'none') || /blur\(/.test(css.filter || '');
    const background = !textClip && !decoration ? gradient || (visibleColor(css.backgroundColor) ? css.backgroundColor : null) : null;
    const imagePrompt = el.dataset?.imagePrompt;
    const isSvg = el.tagName.toLowerCase() === 'svg';
    if (r.width > 0 && r.height > 0 && (background || number(css.borderWidth) || imagePrompt || isSvg)) {
      const path = isSvg && el.children.length === 1 && el.firstElementChild.tagName.toLowerCase() === 'path' && !el.firstElementChild.hasAttribute('transform') && !el.hasAttribute('viewBox') ? el.firstElementChild : null;
      const node = { ...base, key, htmlKey: key, type: path ? 'path' : css.borderRadius === '50%' ? 'ellipse' : 'rect', fill: background || (imagePrompt ? '#E5E7EB' : isSvg ? css.color || '#888888' : 'none'), stroke: number(css.borderWidth) ? css.borderColor : 'none', strokeWidth: number(css.borderWidth), cornerRadius: number(css.borderRadius), shadow: { enabled: false } };
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
    // Own a text subtree once; inline descendants must not emit it again.
    const inlineTree = node => Array.from(node.children || []).every(c => {
      const childCss = view.getComputedStyle(c);
      const compatible = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'letterSpacing', 'lineHeight', 'backgroundClip', 'webkitBackgroundClip'].every(k => childCss[k] === css[k]);
      return inlineTags.has(c.tagName) && childCss.display !== 'none' && childCss.visibility !== 'hidden' && Number.parseFloat(childCss.opacity) !== 0 && (c.tagName === 'BR' || compatible) && inlineTree(c);
    });
    const ownsText = !suppressText && inlineTree(el);
    const children = Array.from(el.childNodes);
    const runs = ownsText ? [{ child: el, index: children.findIndex(c => c.nodeType === 3) >= 0 ? children.findIndex(c => c.nodeType === 3) : 0, text: textContent(el, css.whiteSpace?.startsWith('pre')) }]
      : children.flatMap((child, index) => child.nodeType === 3 ? [{ child, index, text: child.textContent }] : []);
    if (!suppressText) for (const { child, index, text } of runs) {
      if (!text.trim()) continue;
      const range = doc.createRange(); range.selectNodeContents(child);
      const rects = Array.from(range.getClientRects?.() || []).filter(r => r.width && r.height);
      const rect = range.getBoundingClientRect?.() || rects[0];
      if (!rect || !rect.width || !rect.height) continue;
      const fontSize = number(css.fontSize, 16);
      const lineHeight = number(css.lineHeight, fontSize * 1.2);
      const lines = new Set(rects.map(r => Math.round(r.y))).size;
      const multiline = lines > 1 || (ownsText || css.whiteSpace?.startsWith('pre')) && text.includes('\n') || (!lines && rect.height > lineHeight * 1.5);
      const contentWidth = Math.max(0, r.width - number(css.paddingLeft) - number(css.paddingRight) - number(css.borderLeftWidth) - number(css.borderRightWidth));
      const boxWidth = multiline ? Math.ceil(Math.max(contentWidth, rect.width) + 4) : 0;
      const button = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
      const height = Math.ceil(Math.max(rect.height, lineHeight));
      nodes.push({ ...base, key: `${key}/text:${index}`, htmlKey: `${key}/text:${index}`, type: 'text',
        x: Math.round(rect.x + (frame.x || 0)), y: Math.round((button && !multiline ? r.y + (r.height - height) / 2 : rect.y) + (frame.y || 0)),
        width: Math.ceil(Math.max(rect.width, boxWidth)), height, boxWidth,
        text: css.whiteSpace?.startsWith('pre') ? text : text.replace(ownsText ? /[^\S\n]+/g : /\s+/g, ' ').trim(),
        fontFamily: css.fontFamily, fontSize, fontWeight: css.fontWeight || '400', fill: textClip && gradient ? gradient : css.color,
        letterSpacing: number(css.letterSpacing), lineHeight: lineHeight / fontSize,
        align: ['center', 'right'].includes(css.textAlign) ? css.textAlign : 'left' });
    }
    for (const child of children) if (child.nodeType === 1) walk(child, suppressText || ownsText, base.opacity);
  }
  walk(doc.body);
  return nodes;
}
