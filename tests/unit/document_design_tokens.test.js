import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESIGN_TOKENS, validateDesignTokens, buildDocumentDesignContext } from '../../src/canvas/editor/design_tokens.js';
import { createDocument } from '../../src/canvas/editor/scene_doc_factory.js';
import { serialiseDocument, deserialiseDocument } from '../../src/canvas/editor/scene_model_serialization.js';
import { runAgentTurn } from '../../src/canvas/agent/canvas_agent.js';

afterEach(() => vi.unstubAllGlobals());
describe('document design system', () => {
  it('round trips all token groups and markdown without sharing references', () => {
    const doc = { ...createDocument(800, 600), designTokens: structuredClone(DEFAULT_DESIGN_TOKENS), designMd: '# Brand\nQuiet and spacious.' };
    const saved = serialiseDocument(doc);
    const restored = deserialiseDocument(JSON.parse(JSON.stringify(saved)));
    expect(restored.designTokens).toEqual(doc.designTokens);
    expect(restored.designMd).toEqual(doc.designMd);
    saved.designTokens.colors.accent = '#000000';
    expect(doc.designTokens.colors.accent).toBe('#2563eb');
  });
  it('leaves legacy documents and their prompts unchanged', () => {
    const saved = serialiseDocument(createDocument(800, 600));
    expect(saved).not.toHaveProperty('designTokens');
    expect(buildDocumentDesignContext(saved)).toBe('');
  });
  it.each([
    ['typeScale', [0]], ['spacing', [-1]], ['radius', { medium: -1 }],
    ['colors', { accent: '' }], ['components', { button: 'bad' }],
  ])('rejects invalid %s before saving', (key, value) => {
    expect(() => validateDesignTokens({ ...DEFAULT_DESIGN_TOKENS, [key]: value })).toThrow();
  });
  it('injects active document guidance into generation, including CLI stream input', async () => {
    const doc = { designTokens: DEFAULT_DESIGN_TOKENS, designMd: '# Editorial\nUse generous margins.' };
    vi.stubGlobal('window', { __vooEditor: { getDocument: () => doc } });
    const streamStep = vi.fn(async () => ({ text: 'Done', toolCalls: [] }));
    await runAgentTurn({ config: {}, history: [], userText: 'Build a card', tools: [], executeTool: vi.fn(), streamStep });
    const system = streamStep.mock.calls[0][0].messages[0].content;
    expect(system).toContain(JSON.stringify(doc.designTokens));
    expect(system).toContain('Use generous margins.');
    expect(system).toContain('prefer these values over generic style kits');
  });
});
