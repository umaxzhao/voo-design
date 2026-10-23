import { expect, it } from 'vitest';
import { htmlToNodes } from '../../../src/canvas/agent/html_pipeline/html_to_nodes.js';
it('converts measured DOM geometry with native line height, gradients and hidden filtering', () => {
  const rect = { x: 10, y: 20, width: 120, height: 40 };
  const style = { display: 'block', visibility: 'visible', opacity: '1', backgroundColor: 'transparent', backgroundImage: 'none', borderWidth: '0px', borderRadius: '0px', fontFamily: 'Arial', fontSize: '20px', fontWeight: '700', color: 'rgb(1, 2, 3)', letterSpacing: '2px', lineHeight: '30px', textAlign: 'center', whiteSpace: 'normal' };
  const text = { nodeType: 3, textContent: 'Hello  world' };
  const element = (tagName, dataset, css, childNodes = []) => ({ nodeType: 1, tagName, dataset, css: { ...style, ...css }, childNodes, children: childNodes.filter(n => n.nodeType === 1), getAttribute: () => null, getBoundingClientRect: () => rect });
  const headline = element('H1', { vooId: 'headline' }, {}, [text]);
  const hidden = element('DIV', {}, { display: 'none' }, [{ nodeType: 3, textContent: 'Hidden' }]);
  const body = element('BODY', { vooId: 'body' }, { backgroundImage: 'linear-gradient(red, blue)' }, [headline, hidden]);
  headline.parentElement = body; hidden.parentElement = body;
  const doc = { body, defaultView: { getComputedStyle: el => el.css }, createRange: () => ({ selectNodeContents() {}, getClientRects: () => [rect], getBoundingClientRect: () => rect }) };
  const nodes = htmlToNodes(doc, { x: 5, y: 6 });
  expect(nodes[0]).toMatchObject({ key: 'body', type: 'rect', fill: 'linear-gradient(#ff0000ff, #0000ffff)', x: 15, y: 26 });
  expect(nodes[1]).toMatchObject({ key: 'headline/text:0', type: 'text', fontSize: 20, lineHeight: 1.5, text: 'Hello world', letterSpacing: 2, align: 'center' });
  expect(nodes).toHaveLength(2);
});

function fixture({ css = {}, children, rect = { x: 10.4, y: 20.6, width: 120.3, height: 40 }, textRect = { x: 14.2, y: 24.4, width: 80.2, height: 20 }, rects } = {}) {
  const element = (tagName, id, overrides = {}, childNodes = []) => ({
    nodeType: 1, tagName, dataset: { vooId: id },
    css: { opacity: '1', backgroundColor: 'transparent', fontSize: '16px', lineHeight: '24px', color: 'white', ...overrides },
    childNodes, children: childNodes.filter(c => c.nodeType === 1),
    getAttribute: () => null, getBoundingClientRect: () => rect,
  });
  const body = element('BUTTON', 'button', css, children || [{ nodeType: 3, textContent: 'Get started' }]);
  const doc = { body, defaultView: { getComputedStyle: el => el.css }, createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => textRect, getClientRects: () => rects || [textRect] }) };
  return { doc, element };
}
it('keeps single-line labels unwrapped and centers button text with whole-pixel geometry', () => {
  const { doc } = fixture();
  expect(htmlToNodes(doc)[0]).toMatchObject({ text: 'Get started', boxWidth: 0, width: 81, height: 24, x: 14, y: 29 });
});
it('keeps parent direct text separate from inline descendants with DOM line height', () => {
  const { doc, element } = fixture({ css: { paddingLeft: '4px', paddingRight: '4px' }, textRect: { x: 14, y: 24, width: 100.7, height: 48 }, rects: [{ x: 14, y: 24, width: 100, height: 20 }, { x: 14, y: 48, width: 80, height: 20 }] });
  const span = element('SPAN', 'inline', {}, [{ nodeType: 3, textContent: 'shared orbit' }]);
  doc.body.childNodes = [{ nodeType: 3, textContent: 'One ' }, span]; doc.body.children = [span];
  const nodes = htmlToNodes(doc);
  expect(nodes).toHaveLength(2);
  expect(nodes.map(n => n.text)).toEqual(['One', 'shared orbit']);
  expect(nodes[0]).toMatchObject({ boxWidth: 117, width: 117, lineHeight: 1.5 });
});
it('preserves translucent radial and linear fills and skips invisible or unsupported decorations', () => {
  for (const backgroundImage of ['radial-gradient(rgba(255,255,255,0.1), transparent)', 'linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0))']) {
    const { doc } = fixture({ css: { backgroundImage } });
    expect(htmlToNodes(doc)[0].fill).toBe(backgroundImage.startsWith('radial') ? 'radial-gradient(#ffffff1a, #00000000)' : 'linear-gradient(#ffffff33, #ffffff00)');
    for (const css of [{ opacity: '0.0' }, { visibility: 'hidden' }]) {
      Object.assign(doc.body.css, css); expect(htmlToNodes(doc)).toEqual([]);
      Object.assign(doc.body.css, { opacity: '1', visibility: 'visible' });
    }
    doc.body.css.filter = 'blur(30px)';
    expect(htmlToNodes(doc).every(n => n.type === 'text')).toBe(true);
  }
  const { doc } = fixture({ css: { backgroundColor: 'rgba(255, 255, 255, 0.0)' } });
  expect(htmlToNodes(doc)).toHaveLength(1);
});
it('applies background-clip text gradients without emitting a covering rectangle', () => {
  const gradient = 'linear-gradient(white, rgba(255,255,255,0.5))';
  const { doc } = fixture({ css: { backgroundImage: gradient, backgroundClip: 'text', color: 'transparent', backgroundColor: 'white' } });
  expect(htmlToNodes(doc)).toEqual([expect.objectContaining({ type: 'text', fill: 'linear-gradient(#ffffffff, #ffffff80)' })]);
});
