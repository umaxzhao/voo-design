import { expect, it } from 'vitest';
import { htmlToNodes } from '../../../src/canvas/agent/html_pipeline/html_to_nodes.js';
import { splicePatches } from '../../../src/canvas/agent/html_pipeline/critique.js';
it('converts box styles, text geometry and stable IDs to native node specs', () => {
  const rect = { x: 10, y: 20, width: 100, height: 60 };
  const textRect = { x: 14, y: 24, width: 80, height: 30 };
  const element = (tagName, id, css, childNodes = []) => ({
    nodeType: 1, tagName, dataset: { vooId: id },
    css: { opacity: '1', backgroundColor: 'transparent', ...css },
    childNodes, children: childNodes.filter(child => child.nodeType === 1),
    getAttribute: () => null, getBoundingClientRect: () => rect,
  });
  const copy = element('P', 'copy', {
    fontFamily: 'Arial', fontSize: '20px', fontWeight: '700', lineHeight: '30px',
    letterSpacing: '2px', textAlign: 'center', color: 'blue',
  }, [{ nodeType: 3, textContent: 'Hello world' }]);
  const hidden = element('DIV', 'hidden', { display: 'none' }, [{ nodeType: 3, textContent: 'Hidden' }]);
  const card = element('SECTION', 'card', {
    backgroundColor: 'rgb(255, 0, 0)', borderWidth: '2px', borderColor: 'black',
    borderRadius: '50%', boxShadow: '1px 2px 3px rgb(0, 0, 0)',
  }, [copy, hidden]);
  const doc = {
    body: card, defaultView: { getComputedStyle: el => el.css },
    createRange: () => ({ selectNodeContents() {}, getClientRects: () => [], getBoundingClientRect: () => textRect }),
  };
  const nodes = htmlToNodes(doc, { x: 5, y: 7 });
  expect(nodes.find(n => n.key === 'card')).toMatchObject({ type: 'ellipse', x: 15, y: 27, fill: 'rgb(255, 0, 0)', strokeWidth: 2 });
  expect(nodes.find(n => n.type === 'text')).toMatchObject({ text: 'Hello world', x: 19, y: 31, width: 80, fontFamily: 'Arial', fontSize: 20, fontWeight: '700', lineHeight: 1.5, letterSpacing: 2, align: 'center' });
  expect(nodes.some(n => n.text === 'Hidden')).toBe(false);
  expect(nodes.find(n => n.key === 'card').shadow).toMatchObject({ enabled: true, offsetX: 1, offsetY: 2, blur: 3 });
  expect(nodes).toHaveLength(2);
});
it('splices only target IDs and preserves unrelated elements', () => {
  const html = '<html><body><h1 data-voo-id="title">Old</h1><p data-voo-id="body">Keep</p></body></html>';
  // Only the DOM operations used by splicePatches are needed for this fixture.
  class FakeParser {
    parseFromString(source) {
      const elements = [
        { dataset: { vooId: 'title' }, outerHTML: '<h1 data-voo-id="title">Old</h1>' },
        { dataset: { vooId: 'body' }, outerHTML: '<p data-voo-id="body">Keep</p>' },
      ];
      for (const target of elements) {
        target.contains = () => false;
        target.replaceWith = replacement => { source = source.replace(target.outerHTML, replacement.outerHTML); };
      }
      return {
        querySelectorAll: () => elements,
        documentElement: { get outerHTML() { return source; } },
        createElement: () => ({
          set innerHTML(value) {
            const id = /data-voo-id="([^"]+)"/.exec(value)?.[1];
            const replacement = { dataset: { vooId: id }, outerHTML: value };
            this.content = { firstElementChild: replacement, children: [replacement] };
          },
        }),
      };
    }
  }
  const result = splicePatches(html, [{ id: 'title', html: '<h1 data-voo-id="title">New</h1>' }], FakeParser);
  expect(result).toContain('New'); expect(result).toContain('Keep'); expect(result).not.toContain('Old');
  expect(() => splicePatches(html, [{ id: 'missing', html: '<p />' }], FakeParser)).toThrow();
  expect(() => splicePatches(html, [{ id: 'title', html: '<h2>Wrong ID</h2>' }], FakeParser)).toThrow();
});
