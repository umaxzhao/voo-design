import { parseSvgPath } from '../../editor/editor_svg_parse.js';
const number = (s, fallback = 0) => Number.parseFloat(s) || fallback;
// Canvas validates CSS Color 4 values in the rendering document. Two sentinels
// distinguish a rejected assignment from a valid colour equal to either sentinel.
function colorParser(doc) {
  let ctx;
  try { ctx = doc.createElement?.('canvas').getContext?.('2d'); } catch { /* fake DOM */ }
  return function parse(value) {
    if (!value || /^none$/i.test(value)) return null;
    if (/^transparent$/i.test(value)) return { color: '#000000', alpha: 0 };
    let s = value.trim();
    if (ctx) {
      ctx.fillStyle = '#010203'; ctx.fillStyle = s; const a = ctx.fillStyle;
      ctx.fillStyle = '#040506'; ctx.fillStyle = s;
      if (a !== ctx.fillStyle) return null;
      s = a;
    }
    let rgb, alpha = 1;
    if (/^#[\da-f]{3,4}$/i.test(s)) s = '#' + [...s.slice(1)].map(c => c + c).join('');
    if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(s)) {
      rgb = [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
      if (s.length === 9) alpha = parseInt(s.slice(7), 16) / 255;
    } else {
      const m = s.match(/^rgba?\((.*)\)$/i);
      if (m) {
        const parts = m[1].trim().split(/[\s,/]+/);
        if (parts.length < 3 || parts.length > 4 || parts.some(p => !/^[+-]?(?:\d*\.)?\d+%?$/.test(p))) return null;
        rgb = parts.slice(0, 3).map(p => number(p) * (p.endsWith('%') ? 2.55 : 1));
        if (parts[3]) alpha = number(parts[3]) / (parts[3].endsWith('%') ? 100 : 1);
      } else if (/^hsla?\(/i.test(s)) {
        const parts = s.slice(s.indexOf('(') + 1, -1).trim().split(/[\s,/]+/);
        if (parts.length < 3 || parts.length > 4 || !/^[+-]?(?:\d*\.)?\d+(?:deg|rad|grad|turn)?$/.test(parts[0]) || !parts.slice(1, 3).every(p => /^[+-]?(?:\d*\.)?\d+%$/.test(p)) || (parts[3] && !/^[+-]?(?:\d*\.)?\d+%?$/.test(parts[3]))) return null;
        const hue = number(parts[0]) * (parts[0].endsWith('turn') ? 360 : parts[0].endsWith('grad') ? 0.9 : parts[0].endsWith('rad') ? 180 / Math.PI : 1);
        const h = ((hue % 360) + 360) % 360 / 60, sat = number(parts[1]) / 100, l = number(parts[2]) / 100;
        const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2;
        rgb = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h)].map(v => (v + m) * 255);
        if (parts[3]) alpha = number(parts[3]) / (parts[3].endsWith('%') ? 100 : 1);
      } else {
        if (ctx?.getImageData) {
          try {
            ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = s; ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            return parse(`rgba(${r},${g},${b},${a / 255})`);
          } catch { return null; }
        }
        const named = { black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000' };
        if (named[s.toLowerCase()]) return parse(named[s.toLowerCase()]);
        return null;
      }
    }
    if (!rgb.every(Number.isFinite) || !Number.isFinite(alpha) || alpha < 0) return null;
    return { color: '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''), alpha: Math.min(1, alpha) };
  };
}
function splitStops(s) {
  let depth = 0, start = 0; const parts = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    if (s[i] === ')') depth--;
    if (s[i] === ',' && !depth) { parts.push(s.slice(start, i).trim()); start = i + 1; }
  }
  return [...parts, s.slice(start).trim()];
}
function gradientPaint(value, parse) {
  if (!/^(linear|radial)-gradient\(/i.test(value || '') || !value.endsWith(')')) return null;
  const parts = splitStops(value.slice(value.indexOf('(') + 1, -1));
  let count = 0;
  const normalized = parts.map((part, i) => {
    const m = part.match(/^(.*?)(\s+-?[\d.]+%?(?:\s+-?[\d.]+%?)?)?$/);
    const color = parse(m[1]);
    if (color || m[1] === 'transparent') {
      count++;
      return `${color?.color || '#000000'}${Math.round((color?.alpha || 0) * 255).toString(16).padStart(2, '0')}${m[2] || ''}`;
    }
    return i === 0 && /^(to |[-\d.]+(?:deg|turn|rad)|circle|ellipse|at )/.test(part) ? part : null;
  });
  return count >= 2 && normalized.every(Boolean) ? value.slice(0, value.indexOf('(') + 1) + normalized.join(', ') + ')' : null;
}
export function elementKey(el) {
  if (el.dataset?.vooSrc) return el.dataset.vooSrc;
  if (el.dataset?.vooId) return el.dataset.vooId;
  return el.parentElement ? `${elementKey(el.parentElement)}/${el.tagName.toLowerCase()}:${Array.from(el.parentElement.children).indexOf(el)}` : el.tagName.toLowerCase();
}
export function htmlToNodes(doc, frame = {}) {
  const nodes = [], view = doc.defaultView, parseColor = colorParser(doc);
  function walk(el, inheritedOpacity = 1, parentKey) {
    if (['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD'].includes(el.tagName)) return;
    const css = view.getComputedStyle(el), r = el.getBoundingClientRect();
    if (css.display === 'none' || css.visibility === 'hidden' || Number.parseFloat(css.opacity) === 0) return;
    const key = elementKey(el), base = { htmlSource: { id: el.dataset?.vooSrc || key, selector: `[data-voo-src=${JSON.stringify(el.dataset?.vooSrc || key)}]` }, name: el.getAttribute('aria-label') || el.dataset?.vooId || el.tagName.toLowerCase(), x: Math.round(r.x + (frame.x || 0)), y: Math.round(r.y + (frame.y || 0)), width: Math.ceil(r.width), height: Math.ceil(r.height), opacity: inheritedOpacity * ( css.opacity === '' ? 1 : Math.max(0, Math.min(1, Number(css.opacity || 1)))) };
    const layout = /^(inline-)?(flex|grid)$/.test(css.display);
    const overlay = ['absolute', 'fixed'].includes(css.position);
    Object.assign(base, { parentKey, layoutPosition: overlay ? 'absolute' : 'auto',
      layoutWidth: number(css.flexGrow) > 0 || css.alignSelf === 'stretch' || css.width === '100%' ? 'fill' : 'hug',
      layoutHeight: css.height === '100%' ? 'fill' : 'hug' });
    el.setAttribute?.('data-voo-src', key);
    const gradient = gradientPaint(css.backgroundImage, parseColor);
    const textClip = (css.backgroundClip || css.webkitBackgroundClip) === 'text';
    // Masks and blurred glows cannot be represented as a plain opaque rectangle.
    const decoration = (css.maskImage && css.maskImage !== 'none') || (css.webkitMaskImage && css.webkitMaskImage !== 'none') || /blur\(/.test(css.filter || '');
    const bg = parseColor(css.backgroundColor);
    const background = !textClip && !decoration ? gradient || (bg?.alpha > 0 ? bg.color : null) : null;
    const imagePrompt = el.dataset?.imagePrompt;
    const isSvg = el.tagName.toLowerCase() === 'svg';
    if (isSvg) { emitSvg(el, base, key, view, parseColor, nodes); return; }
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map(side => {
      const width = number(css[`border${side}Width`] ?? css.borderWidth);
      const style = css[`border${side}Style`] ?? css.borderStyle;
      return { width: style === 'none' || style === 'hidden' ? 0 : width, paint: parseColor(css[`border${side}Color`] || css.borderColor) };
    });
    const uniform = sides.every(s => s.width === sides[0].width && s.paint?.color === sides[0].paint?.color && s.paint?.alpha === sides[0].paint?.alpha);
    if (r.width > 0 && r.height > 0 && (layout || background || sides.some(s => s.width && s.paint) || imagePrompt)) {
      const border = uniform ? sides[0] : { width: 0 };
      const node = { ...base, key, htmlKey: key, type: layout ? 'frame' : css.borderRadius === '50%' ? 'ellipse' : 'rect', fill: background || (imagePrompt ? '#E5E7EB' : 'transparent'), fillOpacity: gradient ? 1 : bg?.alpha ?? 1, stroke: border.paint?.color || 'transparent', strokeOpacity: border.paint?.alpha ?? 1, strokeWidth: border.width, cornerRadius: number(css.borderRadius), shadow: { enabled: false } };
      if (layout) {
        const vertical = css.flexDirection?.startsWith('column') || css.display.includes('grid') && css.gridAutoFlow?.startsWith('column');
        const align = value => ({ 'flex-start': 'start', 'flex-end': 'end', normal: 'start' }[value] || value || 'start');
        node.autoLayout = { direction: vertical ? 'vertical' : 'horizontal',
          gap: number(vertical ? css.rowGap : css.columnGap, number(css.gap)),
          crossGap: number(vertical ? css.columnGap : css.rowGap, number(css.gap)),
          padding: Object.fromEntries(['Top', 'Right', 'Bottom', 'Left'].map(side => [side.toLowerCase(), number(css[`padding${side}`])])),
          alignItems: align(css.alignItems), justifyContent: align(css.justifyContent),
          wrap: css.display.includes('grid') || css.flexWrap === 'wrap' || css.flexWrap === 'wrap-reverse' };
      }
      if (imagePrompt) node.imagePrompt = imagePrompt;
      if (css.boxShadow && css.boxShadow !== 'none') {
        const color = css.boxShadow.match(/rgba?\([^)]*\)|#[\da-f]+/i)?.[0] || '#000000';
        const lengths = css.boxShadow.replace(color, '').match(/-?[\d.]+px/g)?.map(Number.parseFloat) || [];
        const paint = parseColor(color);
        node.shadow = { enabled: !!paint, color: paint?.color, offsetX: lengths[0] || 0, offsetY: lengths[1] || 0, blur: lengths[2] || 0, opacity: paint?.alpha ?? 0 };
      }
      if (layout || background || imagePrompt || border.width) nodes.push(node);
      if (!uniform) sides.forEach((side, i) => {
        if (!side.width || !side.paint) return;
        const horizontal = i % 2 === 0;
        const sideKey = `${key}/border:${i}`;
        nodes.push({ ...base, key: sideKey, htmlKey: sideKey, type: 'rect', x: base.x + (i === 1 ? r.width - side.width : 0), y: base.y + (i === 2 ? r.height - side.width : 0), width: horizontal ? r.width : side.width, height: horizontal ? side.width : r.height, fill: side.paint.color, fillOpacity: side.paint.alpha, stroke: 'transparent', strokeWidth: 0 });
      });
    }
    const children = Array.from(el.childNodes || []);
    const runs = children.flatMap((child, index) => child.nodeType === 3 ? [{ child, index, text: child.textContent }] : []);
    for (const { child, index, text } of runs) {
      if (!text.trim()) continue;
      const range = doc.createRange(); range.selectNodeContents(child);
      const rects = Array.from(range.getClientRects?.() || []).filter(r => r.width && r.height);
      const rect = range.getBoundingClientRect?.() || rects[0];
      if (!rect || !rect.width || !rect.height) continue;
      const fontSize = number(css.fontSize, 16);
      const lineHeight = number(css.lineHeight, fontSize * 1.2);
      const lines = new Set(rects.map(r => Math.round(r.y))).size;
      const multiline = lines > 1 || css.whiteSpace?.startsWith('pre') && text.includes('\n') || (!lines && rect.height > lineHeight * 1.5);
      // Inline fragments wrap against their containing block, not their Range.
      let block = el;
      while (view.getComputedStyle(block).display === 'inline' && block.parentElement) block = block.parentElement;
      const blockCss = view.getComputedStyle(block), blockRect = block.getBoundingClientRect();
      const contentWidth = Math.max(0, blockRect.width - number(blockCss.paddingLeft) - number(blockCss.paddingRight) - number(blockCss.borderLeftWidth) - number(blockCss.borderRightWidth));
      const boxWidth = multiline ? contentWidth : 0;
      const first = rects[0] || rect;
      // Range rectangles cover font glyph metrics, not CSS leading. Removing
      // half the leading also preserves the browser's button/flex alignment.
      const top = first.y - (lineHeight - first.height) / 2;
      const height = (lines || Math.max(1, Math.round(rect.height / lineHeight))) * lineHeight;
      nodes.push({ ...base, key: `${key}/text:${index}`, htmlKey: `${key}/text:${index}`, type: 'text', parentKey: layout ? key : parentKey, layoutPosition: layout ? 'auto' : base.layoutPosition,
        x: (multiline ? blockRect.x + number(blockCss.borderLeftWidth) + number(blockCss.paddingLeft) : rect.x) + (frame.x || 0),
        y: top + (frame.y || 0),
        width: multiline ? boxWidth : rect.width, height, boxWidth,
        text: css.whiteSpace?.startsWith('pre') ? text : text.replace(/\s+/g, ' ').trim(),
        fontFamily: css.fontFamily, fontSize, fontWeight: css.fontWeight || '400', fill: textClip && gradient ? gradient : parseColor(css.color)?.color || 'transparent', fillOpacity: textClip && gradient ? 1 : parseColor(css.color)?.alpha ?? 0,
        letterSpacing: number(css.letterSpacing), lineHeight: lineHeight / fontSize,
        align: ['center', 'right'].includes(css.textAlign) ? css.textAlign : 'left' });
    }
    for (const child of children) if (child.nodeType === 1) walk(child, base.opacity, layout ? key : parentKey);
  }
  walk(doc.body);
  return nodes;
}

// Reuse create_path's parser, including its cubic approximation of SVG arcs.
function emitSvg(svg, base, key, view, parseColor, nodes) {
  const attr = (el, name) => el.getAttribute?.(name);
  const vb = (attr(svg, 'viewBox') || `0 0 ${base.width} ${base.height}`).trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0) return;
  let sx = base.width / vb[2], sy = base.height / vb[3], ox = 0, oy = 0;
  const aspect = attr(svg, 'preserveAspectRatio') || 'xMidYMid meet';
  if (aspect !== 'none') {
    const scale = aspect.includes('slice') ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = sy = scale;
    ox = (base.width - vb[2] * scale) * (aspect.includes('xMin') ? 0 : aspect.includes('xMax') ? 1 : 0.5);
    oy = (base.height - vb[3] * scale) * (aspect.includes('YMin') ? 0 : aspect.includes('YMax') ? 1 : 0.5);
  }
  const X = x => (x - vb[0]) * sx + ox, Y = y => (y - vb[1]) * sy + oy;
  function visit(el, inherited, childKey, opacity) {
    const css = view.getComputedStyle(el);
    if (css.display === 'none' || css.visibility === 'hidden' || attr(el, 'transform')) return;
    const paint = {};
    for (const [prop, name] of [['fill', 'fill'], ['stroke', 'stroke'], ['strokeWidth', 'stroke-width'], ['color', 'color'], ['fillOpacity', 'fill-opacity'], ['strokeOpacity', 'stroke-opacity']]) {
      paint[prop] = css[prop] || attr(el, name) || inherited[prop];
    }
    const resolve = value => parseColor(value === 'currentColor' ? paint.color : value);
    const fill = resolve(paint.fill), stroke = resolve(paint.stroke);
    const style = { ...base, key: childKey, htmlKey: childKey, opacity: opacity * (css.opacity === undefined || css.opacity === '' ? 1 : Number(css.opacity)), fill: fill?.color || 'transparent', fillOpacity: (fill?.alpha ?? 0) * (Number.isFinite(parseFloat(paint.fillOpacity)) ? parseFloat(paint.fillOpacity) : 1), stroke: stroke?.color || 'transparent', strokeOpacity: (stroke?.alpha ?? 0) * (Number.isFinite(parseFloat(paint.strokeOpacity)) ? parseFloat(paint.strokeOpacity) : 1), strokeWidth: stroke ? (Number.isFinite(parseFloat(paint.strokeWidth)) ? parseFloat(paint.strokeWidth) : 1) * Math.sqrt(sx * sy) : 0 };
    const tag = el.tagName.toLowerCase(), n = name => number(attr(el, name));
    if (tag === 'svg' || tag === 'g') {
      Array.from(el.children || []).forEach((child, i) => visit(child, paint, `${childKey}/svg:${i}`, tag === 'svg' ? base.opacity : style.opacity));
      return;
    }
    if (!(fill?.alpha > 0) && !(stroke?.alpha > 0)) return;
    if (tag === 'circle' || tag === 'ellipse') {
      const rx = n(tag === 'circle' ? 'r' : 'rx'), ry = n(tag === 'circle' ? 'r' : 'ry');
      if (rx <= 0 || ry <= 0) return;
      nodes.push({ ...style, type: 'ellipse', x: base.x + X(n('cx') - rx), y: base.y + Y(n('cy') - ry), width: rx * 2 * sx, height: ry * 2 * sy });
      return;
    }
    let d;
    if (tag === 'path') d = attr(el, 'd');
    if (tag === 'rect') {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      if (w <= 0 || h <= 0) return;
      d = `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
    }
    if (tag === 'line') d = `M ${n('x1')} ${n('y1')} L ${n('x2')} ${n('y2')}`;
    if (tag === 'polyline' || tag === 'polygon') {
      const values = (attr(el, 'points') || '').trim().split(/[\s,]+/).map(Number);
      if (values.length < 4 || values.length % 2 || !values.every(Number.isFinite)) return;
      d = `M ${values[0]} ${values[1]} ` + values.slice(2).reduce((s, v, i) => s + (i % 2 ? `${v} ` : `L ${v} `), '') + (tag === 'polygon' ? 'Z' : '');
    }
    // Reject unknown tokens instead of letting the permissive SVG tokenizer drop them.
    if (!d || !/^\s*[Mm]/.test(d) || d.replace(/[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[\s,]/g, '')) return;
    // Check command arities before the shared parser (a number after Z is invalid).
    const arities = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
    for (const group of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
      const count = (group[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || []).length;
      const arity = arities[group[1].toLowerCase()];
      if (arity ? !count || count % arity : count) return;
    }
    try {
      let previous = { x: 0, y: 0 };
      const contours = [];
      for (let contour of d.match(/[Mm][^Mm]*/g) || []) {
        if (contour[0] === 'm') {
          const m = contour.match(/^m\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[\s,]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
          if (!m) return;
          const rest = contour.slice(m[0].length).trim();
          contour = `M ${previous.x + Number(m[1])} ${previous.y + Number(m[2])} ` + (/^[+\-\d.]/.test(rest) ? 'l ' : '') + rest;
        }
        const raw = parseSvgPath(contour);
        if (!raw.length) return;
        previous = raw.at(-1).close ? raw[0] : raw.at(-1);
        contours.push(raw);
      }
      const grouped = [];
      for (const raw of contours) {
        if (raw.at(-1).close && grouped.at(-1)?.at(-1).close) grouped[grouped.length - 1].push(...raw);
        else grouped.push(raw);
      }
      const converted = grouped.map(raw => raw.map(p => ({ x: X(p.x), y: Y(p.y), in: p.in ? [p.in[0] * sx, p.in[1] * sy] : null, out: p.out ? [p.out[0] * sx, p.out[1] * sy] : null, close: !!p.close })));
      if (converted.flat().some(p => ![p.x, p.y, ...(p.in || []), ...(p.out || [])].every(Number.isFinite))) return;
      converted.forEach((points, i) => {
      if (points.length < 2 || points.some(p => ![p.x, p.y, ...(p.in || []), ...(p.out || [])].every(Number.isFinite))) return;
      nodes.push({ ...style, key: `${childKey}/contour:${i}`, htmlKey: `${childKey}/contour:${i}`, type: 'path', d, points, baseWidth: base.width, baseHeight: base.height });
      });
    } catch { /* Malformed icons have no fallback box. */ }
  }
  visit(svg, { fill: 'black', stroke: 'none', color: 'black', strokeWidth: '1', fillOpacity: '1', strokeOpacity: '1' }, key, base.opacity);
}
