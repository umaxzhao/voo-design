import { describe, expect, it } from 'vitest';
import { colorPickerValue, numberDraft, updateTokenPath } from '../../src/canvas/components/design_token_controls.js';
import { DEFAULT_DESIGN_TOKENS, validateDesignTokens } from '../../src/canvas/editor/design_tokens.js';

describe('design token controls', () => {
  it('expands short hex without replacing CSS color values', () => {
    expect(colorPickerValue('#abc')).toBe('#aabbcc');
    expect(colorPickerValue('#123ABC')).toBe('#123ABC');
    expect(colorPickerValue('rgba(0,0,0,.5)')).toBe('#000000');
  });
  it('keeps empty drafts invalid and parses fractional pixel values', () => {
    expect(numberDraft('')).toBe('');
    expect(numberDraft('  ')).toBe('');
    expect(numberDraft('0')).toBe(0);
    expect(numberDraft('2.5')).toBe(2.5);
    expect(() => validateDesignTokens(updateTokenPath(DEFAULT_DESIGN_TOKENS, ['spacing', '1'], numberDraft('')))).toThrow();
    expect(() => validateDesignTokens(updateTokenPath(DEFAULT_DESIGN_TOKENS, ['spacing', '1'], -1))).toThrow();
  });
  it('preserves custom roles, scale lengths, and extra document token metadata', () => {
    const tokens = { ...structuredClone(DEFAULT_DESIGN_TOKENS), fontFamily: 'Inter' };
    tokens.colors.brand = 'var(--brand)';
    tokens.spacing.push(96);
    const updated = updateTokenPath(tokens, ['colors', 'brand'], '#abcdef');
    expect(validateDesignTokens(updated).fontFamily).toBe('Inter');
    expect(updated.spacing.at(-1)).toBe(96);
    expect(tokens.colors.brand).toBe('var(--brand)');
  });
  it('updates nested component tokens and scale entries without mutating the document', () => {
    const updated = updateTokenPath(DEFAULT_DESIGN_TOKENS, ['components', 'button', 'paddingX'], 20);
    expect(updated.components.button.paddingX).toBe(20);
    expect(DEFAULT_DESIGN_TOKENS.components.button.paddingX).toBe(16);
    expect(updateTokenPath(updated, ['typeScale', '0'], 13).typeScale[0]).toBe(13);
    expect(updated.typeScale[0]).toBe(12);
  });
});
