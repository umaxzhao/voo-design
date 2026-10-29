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

it('imports UI flex and grid containers as nested native Auto Layout frames', () => {
  const makeElement = (tagName, id, rect, css = {}, children = []) => ({
    nodeType: 1,
    tagName,
    dataset: { vooId: id },
    css: { opacity: '1', backgroundColor: 'transparent', ...css },
    childNodes: children,
    children: children.filter((child) => child.nodeType === 1),
    getAttribute: () => null,
    getBoundingClientRect: () => rect,
  });
  const button = makeElement('BUTTON', 'primary-action', { x: 16, y: 16, width: 120, height: 40 });
  const nav = makeElement('NAV', 'navigation', { x: 0, y: 0, width: 320, height: 56 }, {
    display: 'flex', flexDirection: 'row', gap: '12px', paddingLeft: '16px',
    alignItems: 'center', justifyContent: 'space-between',
  }, [button]);
  const card = makeElement('ARTICLE', 'feature-card', { x: 0, y: 72, width: 320, height: 160 }, {
    display: 'grid', gap: '16px', padding: '20px', paddingTop: '20px',
    paddingRight: '20px', paddingBottom: '20px', paddingLeft: '20px',
  });
  const page = makeElement('MAIN', 'page-content', { x: 0, y: 0, width: 360, height: 260 }, {
    display: 'flex', flexDirection: 'column', gap: '16px',
  }, [nav, card]);
  nav.parentElement = page;
  card.parentElement = page;
  button.parentElement = nav;
  const doc = {
    body: page,
    defaultView: { getComputedStyle: (element) => element.css },
    createRange: () => ({ getClientRects: () => [], getBoundingClientRect: () => null }),
  };

  const nodes = htmlToNodes(doc);
  expect(nodes.find((node) => node.key === 'page-content')).toMatchObject({
    type: 'frame',
    autoLayout: { direction: 'vertical', gap: 16, wrap: false },
  });
  expect(nodes.find((node) => node.key === 'navigation')).toMatchObject({
    type: 'frame',
    parentKey: 'page-content',
    autoLayout: { direction: 'horizontal', gap: 12, padding: { left: 16 }, justifyContent: 'space-between' },
  });
  expect(nodes.find((node) => node.key === 'feature-card')).toMatchObject({
    type: 'frame',
    parentKey: 'page-content',
    autoLayout: { direction: 'horizontal', wrap: true, gap: 16, padding: { top: 20, right: 20, bottom: 20, left: 20 } },
  });
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
it('keeps single-line labels unwrapped and uses the measured line box without centering button text twice', () => {
  const { doc } = fixture();
  expect(htmlToNodes(doc)[0]).toMatchObject({ text: 'Get started', boxWidth: 0, width: 80.2, height: 24, x: 14.2, y: 22.4 });
});
it('keeps parent direct text separate from inline descendants with DOM line height', () => {
  const { doc, element } = fixture({ css: { paddingLeft: '4px', paddingRight: '4px' }, textRect: { x: 14, y: 24, width: 100.7, height: 48 }, rects: [{ x: 14, y: 24, width: 100, height: 20 }, { x: 14, y: 48, width: 80, height: 20 }] });
  const span = element('SPAN', 'inline', {}, [{ nodeType: 3, textContent: 'shared orbit' }]);
  doc.body.childNodes = [{ nodeType: 3, textContent: 'One ' }, span]; doc.body.children = [span];
  const nodes = htmlToNodes(doc);
  expect(nodes).toHaveLength(2);
  expect(nodes.map(n => n.text)).toEqual(['One', 'shared orbit']);
  expect(nodes[0]).toMatchObject({ boxWidth: 112.3, width: 112.3, lineHeight: 1.5 });
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

it('preserves fractional content width and removes multiline leading before the first baseline', async () => {
  const { layoutTextLines, measureText } = await import('../../../src/canvas/editor/text_metrics.js');
  const { paintTextBody } = await import('../../../src/canvas/editor/render_text_node.js');
  const { doc } = fixture({
    css: { display: 'block', fontSize: '18px', lineHeight: '30px', paddingLeft: '12px', paddingRight: '12px', borderLeftWidth: '1px', borderRightWidth: '1px' },
    rect: { x: 24, y: 24, width: 260.25, height: 146 },
    textRect: { x: 37, y: 42, width: 231.8, height: 110 },
    rects: [0, 1, 2, 3].map(i => ({ x: 37, y: 42 + i * 30, width: 231.8, height: 20 })),
    children: [{ nodeType: 3, textContent: 'alpha beta gamma delta' }],
  });
  const [node] = htmlToNodes(doc);
  expect(node).toMatchObject({ x: 37, y: 37, height: 120, width: 234.25, boxWidth: 234.25, lineHeight: 30 / 18 });
  const painted = [];
  const ctx = { save() {}, restore() {}, measureText: text => ({ width: text.length * 16.7, fontBoundingBoxAscent: 16, fontBoundingBoxDescent: 4 }), fillText: (...args) => painted.push(args) };
  expect(layoutTextLines(ctx, node)).toEqual(['alpha beta', 'gamma delta']);
  expect(measureText(ctx, node).height).toBe(60);
  paintTextBody(ctx, node);
  expect(painted.map(args => args[2])).toEqual([58, 88]);
  // Widening the box by the old four-pixel allowance changes the break.
  ctx.measureText = text => ({ width: text === 'alpha beta gamma' ? 236 : text.length * 10 });
  expect(layoutTextLines(ctx, node)[0]).toBe('alpha beta');
});

it('uses an inline text fragment’s containing block width for wrapping', () => {
  const { doc, element } = fixture({ css: { display: 'block', paddingLeft: '3px', paddingRight: '5px' },
    textRect: { x: 14, y: 24, width: 80, height: 44 },
    rects: [{ x: 14, y: 24, width: 80, height: 20 }, { x: 14, y: 48, width: 60, height: 20 }] });
  const span = element('SPAN', 'inline', { display: 'inline' }, [{ nodeType: 3, textContent: 'wrapped words' }]);
  span.getBoundingClientRect = () => ({ x: 14, y: 24, width: 80, height: 44 });
  span.parentElement = doc.body;
  doc.body.childNodes = [span]; doc.body.children = [span];
  expect(htmlToNodes(doc)[0].boxWidth).toBe(112.3);
});

it('preserves flex-centered single-line text using its Range rather than the container center', () => {
  const { doc } = fixture({
    css: { display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '24px' },
    rect: { x: 0, y: 0, width: 200, height: 100 },
    textRect: { x: 60, y: 41.5, width: 80, height: 17 },
  });
  doc.body.tagName = 'DIV';
  const nodes = htmlToNodes(doc);
  expect(nodes[0]).toMatchObject({ type: 'frame', x: 0, y: 0, height: 100 });
  expect(nodes.find(n => n.type === 'text')).toMatchObject({ parentKey: 'button', x: 60, y: 38, height: 24, boxWidth: 0 });
  // Asymmetric button padding can put the label off the border-box center.
  doc.body.tagName = 'BUTTON';
  doc.body.css.paddingTop = '20px';
  expect(htmlToNodes(doc).find(n => n.type === 'text')).toMatchObject({ y: 38, height: 24 });
});

it('keeps absolute text geometry and positioning inside a flex frame', () => {
  const { doc, element } = fixture({ css: { display: 'flex' } });
  const label = element('SPAN', 'overlay', { position: 'absolute', lineHeight: '24px', color: 'white' }, [{ nodeType: 3, textContent: 'Overlay' }]);
  doc.body.childNodes = [label]; doc.body.children = [label]; label.parentElement = doc.body;
  expect(htmlToNodes(doc).find(n => n.type === 'text')).toMatchObject({ parentKey: 'button', layoutPosition: 'absolute', x: 14.2, y: 22.4, height: 24, boxWidth: 0 });
});
