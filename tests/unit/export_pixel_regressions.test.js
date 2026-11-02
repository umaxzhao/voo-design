import { expect, it } from 'vitest';
import { documentToSvg } from '../../src/canvas/editor/editor_svg.js';

it('preserves text opacity, including zero, for single and multiline text', () => {
  for (const text of ['Hello', 'Hello\nworld']) {
    for (const opacity of [0, 0.4, 1]) {
      const svg = documentToSvg({
        width: 100, height: 100,
        nodes: [{
          id: 't', kind: 'text', x: 0, y: 0, width: 100, height: 60,
          fontSize: 20, text, opacity,
        }],
      });
      if (text.includes('\n')) expect(svg).toContain('<tspan ');
      if (opacity < 1) expect(svg).toContain(`opacity="${opacity}"`);
      else expect(svg).not.toContain('opacity=');
    }
  }
});

it('preserves edited radial centre and elliptical radii', () => {
  const svg = documentToSvg({
    width: 100, height: 100,
    nodes: [{
      id: 'g', kind: 'rect', x: 0, y: 0, width: 100, height: 100,
      fill: 'radial-gradient(ellipse 30% 40% at 25% 75%, #ffffff 0%, #000000 100%)',
    }],
  });
  expect(svg).toContain('gradientTransform="translate(0.25 0.75) scale(0.3 0.4)"');
});
