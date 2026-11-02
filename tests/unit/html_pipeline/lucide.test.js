import { expect, it } from 'vitest';
import { ICONS, expandLucideIcons } from '../../../src/canvas/agent/html_pipeline/lucide.js';
it('loads real icon data for every supported name including aliases', () => {
  for (const [name, icon] of Object.entries(ICONS)) {
    expect(icon.name, name).toBeTypeOf('string');
    expect(icon.node.length, name).toBeGreaterThan(0);
    const svg = expandLucideIcons(`<i class="w-4 text-slate-500" data-lucide="${name}"></i>`);
    expect(svg).toContain('<svg');
    expect(svg).toContain('class="w-4 text-slate-500"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toContain('key=');
  }
  expect(ICONS.home.name).toBe('house');
});
it('preserves unknown icons and expands supported quote forms', () => {
  expect(expandLucideIcons('<i data-lucide="unknown"></i>')).toBe('<i data-lucide="unknown"></i>');
  expect(expandLucideIcons("<i data-lucide='search'></i><i data-lucide=home></i>").match(/<svg/g)).toHaveLength(2);
});
