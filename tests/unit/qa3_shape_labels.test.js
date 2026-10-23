import { expect, it } from 'vitest';
import en from '../../src/shared/i18n/en.js';
import zh from '../../src/shared/i18n/zh.js';

it.each([
  ['en', en, 'Rectangle', 'Ellipse'],
  ['zh', zh, '矩形', '椭圆'],
])('provides the shape property headings in %s', (_, dictionary, rect, ellipse) => {
  expect(dictionary['editor.shape.rect']).toBe(rect);
  expect(dictionary['editor.shape.ellipse']).toBe(ellipse);
});
