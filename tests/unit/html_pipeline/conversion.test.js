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
  expect(nodes[0]).toMatchObject({ key: 'body', type: 'rect', fill: 'linear-gradient(red, blue)', x: 15, y: 26 });
  expect(nodes[1]).toMatchObject({ key: 'headline/text:0', type: 'text', fontSize: 20, lineHeight: 1.5, text: 'Hello world', letterSpacing: 2, align: 'center' });
  expect(nodes).toHaveLength(2);
});
