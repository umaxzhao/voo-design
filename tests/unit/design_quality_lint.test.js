import { describe, it, expect, vi, afterEach } from 'vitest';
import { lintDesign } from '../../src/canvas/agent/design_quality/lint.js';
import { lintDesignTool, LINT_TOOL_SCHEMA } from '../../src/canvas/agent/design_quality/lint_tool.js';
import { runCritiqueLoop, formatIssuesForModel } from '../../src/canvas/agent/design_quality/critique_loop.js';
import { runAgentTurn } from '../../src/canvas/agent/canvas_agent.js';
import { parseOptions } from '../../scripts/design-bench/run.mjs';

const rect = (id, patch = {}) => ({ id, kind: 'rect', x: 0, y: 0, width: 100, height: 60, fill: '#ffffff', ...patch });
const text = (id, patch = {}) => rect(id, { kind: 'text', fontSize: 16, fill: '#111111', ...patch });
const rules = nodes => lintDesign({ nodes }).issues.map(i => i.rule);

describe('lint geometry and tokens', () => {
  it.each([
    ['overlap', [rect('a'), rect('b', { x: 50, y: 20 })]],
    ['overflow', [rect('p', { kind: 'group' }), rect('c', { parentId: 'p', x: 90 })]],
    ['misalignment', [rect('a'), rect('b', { x: 2, y: 100 })]],
    ['offGrid', [rect('a', { autoLayout: { gap: 7, padding: { top: 5, bottom: 8 } } })]],
    ['typeScale', [text('a', { fontSize: 17 })]],
    ['contrast', [text('a', { fill: '#aaaaaa' })]],
    ['radii', [4,8,12,16].map((cornerRadius,i) => rect(`${i}`, { x: i*120, cornerRadius }))],
    ['purpleGradient', [rect('a', { gradient: { stops: [{ color: '#9333ea' }, { color: '#2563eb' }] } })]],
    ['identicalCards', [0,1,2].map(i => rect(`${i}`, { x: i*120 }))],
    ['centerStackedHero', [text('h', { width: 400, height: 72, fontSize: 60 }), text('s', { x: 100, y: 100, width: 200, height: 24 }), rect('cta', { x: 150, y: 160, width: 100, height: 40 })]],
    ['decorativeLines', [0,1,2,3].map(i => rect(`${i}`, { kind: 'ellipse', x: i*120 }))],
    ['evenTemplateSpacing', [0,1,2].map(i => rect(`${i}`, { x: i*120, autoLayout: { gap: 16 } }))],
    ['flatHierarchy', [text('a'), text('b', { y: 100, fontSize: 20 })]],
    ['noFocal', [0,1,2].map(i => rect(`${i}`, { x: i*120, width: 100+i*10 }))],
  ])('detects %s', (rule, nodes) => {
    expect(rules(nodes)).toContain(rule);
    const result = lintDesign({ nodes });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    for (const issue of result.issues) expect(issue).toEqual({ rule: expect.any(String), severity: expect.stringMatching(/^(error|warn)$/), nodeIds: expect.any(Array), message: expect.any(String), fix: expect.any(String) });
  });
  it('detects chaotic type even when all sizes are tokens', () => {
    expect(rules([12,14,16,20,24,48].map((fontSize,i) => text(`${i}`, { fontSize, y: i*100 })))).toContain('typeScale');
  });
  it('uses WCAG large text and bold thresholds', () => {
    expect(rules([text('a', { fontSize: 24, fill: '#888888' })])).not.toContain('contrast');
    expect(rules([text('a', { fontSize: 18, fontWeight: 700, fill: '#888888' })])).toContain('contrast');
  });
  it('checks earlier containing backgrounds and ancestor fills', () => {
    expect(rules([rect('bg', { fill: '#111111' }), text('a', { fill: '#222222' })])).toContain('contrast');
    expect(rules([rect('bg', { kind: 'group', fill: '#111111' }), text('a', { parentId: 'bg', fill: '#ffffff' })])).not.toContain('contrast');
  });
  it('does not flag containing backgrounds or group overlap', () => {
    expect(rules([rect('a', { width: 500, height: 500 }), text('b', { x: 20, y: 20 })])).not.toContain('overlap');
    expect(rules([rect('a', { kind: 'group' }), rect('b', { x: 50 })])).not.toContain('overlap');
  });
  it('scopes root descendants, supports children ids and ignores hidden branches', () => {
    const nodes = [rect('root', { kind: 'group', x: 200, y: 200, width: 400, height: 400, children: ['child'] }), text('child', { x: 220, y: 220, fontSize: 17 }), rect('other', { autoLayout: { gap: 3 } })];
    const result = lintDesign({ nodes }, { rootId: 'root' });
    expect(result.metrics.nodeCount).toBe(2);
    expect(result.issues.map(i => i.rule)).not.toContain('overflow');
    expect(result.issues.map(i => i.rule)).not.toContain('offGrid');
    nodes[0].visible = false;
    expect(lintDesign({ nodes }, { rootId: 'root' }).metrics.nodeCount).toBe(0);
  });
  it('handles missing root, empty input and cyclic ancestry without mutation', () => {
    expect(lintDesign(null).score).toBe(100);
    expect(lintDesign({ nodes: [] }, { rootId: 'missing' }).metrics.rootFound).toBe(false);
    const doc = { nodes: [rect('a', { parentId: 'b' }), rect('b', { parentId: 'a' })] };
    const original = JSON.stringify(doc); lintDesign(doc); expect(JSON.stringify(doc)).toBe(original);
  });
  it('scores a polished asymmetric composition at least 85', () => {
    const nodes = [rect('root', { kind: 'group', width: 1000, height: 800 }), text('h', { parentId: 'root', x: 40, y: 40, width: 600, height: 80, fontSize: 60 }), text('body', { parentId: 'root', x: 40, y: 144, width: 400, height: 40 }), rect('main', { parentId: 'root', x: 40, y: 240, width: 600, height: 400 }), rect('activity', { parentId: 'root', x: 680, y: 240, width: 280, height: 300 })];
    expect(lintDesign({ width: 1000, height: 800, nodes }).score).toBeGreaterThanOrEqual(85);
  });
  it('scores an AI template low and caps repeated rule penalties', () => {
    const nodes = [0,1,2,3,4,5].map(i => rect(`${i}`, { x: i*101, cornerRadius: i+1, autoLayout: { gap: 7 }, gradient: { stops: ['purple','blue'] } }));
    nodes.push(text('h', { fontSize: 17, fill: '#cccccc' }), text('b', { y: 100, fill: '#cccccc' }));
    expect(lintDesign({ nodes }).score).toBeLessThan(50);
  });
  it('recognizes structural dividers and empty canvas hierarchy', () => {
    expect(rules([0,1,2,3].map(i => rect(`${i}`, { name: 'divider', height: 1, y: i*20 })))).not.toContain('decorativeLines');
    expect(lintDesign({ width: 2000, height: 2000, nodes: [rect('tiny')] }).issues.map(i => i.rule)).toContain('flatHierarchy');
  });
});

describe('critique loop and tool', () => {
  it('passes feedback and round, relints and stops at threshold with warnings', async () => {
    const initial = lintDesign({ nodes: [text('a', { fontSize: 17, fill: '#cccccc' })] });
    const lint = vi.fn().mockReturnValueOnce(initial).mockReturnValue({ score: 90, issues: initial.issues });
    const fix = vi.fn(); const result = await runCritiqueLoop({ lint, fix });
    expect(fix).toHaveBeenCalledWith(formatIssuesForModel(initial), 1);
    expect(result.rounds).toHaveLength(2); expect(result.final.score).toBe(90);
  });
  it('limits evaluations and never fixes after final lint', async () => {
    const lint = vi.fn(() => ({ score: 10, issues: [] })); const fix = vi.fn();
    const result = await runCritiqueLoop({ lint, fix, maxRounds: 3 });
    expect(result.rounds).toHaveLength(3); expect(fix).toHaveBeenCalledTimes(2); expect(lint).toHaveBeenCalledTimes(3);
    await expect(runCritiqueLoop({ lint, maxRounds: 0 })).rejects.toThrow();
  });
  it('stops without fix and propagates errors', async () => {
    expect((await runCritiqueLoop({ lint: () => ({ score: 0, issues: [] }) })).rounds).toHaveLength(1);
    await expect(runCritiqueLoop({ lint: () => { throw Error('broken'); } })).rejects.toThrow('broken');
  });
  it('exports a read-only schema and returns the scoped lint result', () => {
    const editor = { getDocument: () => ({ nodes: [text('a', { fontSize: 17 })] }) };
    expect(LINT_TOOL_SCHEMA.function.name).toBe('lint_design');
    expect(lintDesignTool({ rootId: 'a' }, editor)).toEqual(lintDesign(editor.getDocument(), { rootId: 'a' }));
    expect(() => lintDesignTool({}, null)).toThrow('agentNoEditor');
  });
  it('accepts an executor context without mistaking it for the engine', () => {
    const editor = { getDocument: () => ({ nodes: [text('a', { fontSize: 17 })] }) };
    expect(lintDesignTool({}, { editor })).toEqual(lintDesign(editor.getDocument()));
    vi.stubGlobal('window', { __vooEditor: editor });
    try { expect(lintDesignTool({}, {})).toEqual(lintDesign(editor.getDocument())); }
    finally { vi.unstubAllGlobals(); }
  });
});

describe('baseline kill switch', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(['global', 'storage'])('skips quality prompt with %s switch', async mode => {
    if (mode === 'global') vi.stubGlobal('__VOO_DESIGN_QUALITY_OFF__', true);
    else vi.stubGlobal('localStorage', { getItem: key => key === 'voo.designQuality' ? 'off' : null });
    let system;
    await runAgentTurn({ config: {}, history: [], userText: 'dashboard', tools: [], executeTool: vi.fn(), streamStep: async ({ messages }) => { system = messages[0].content; return { text: 'done', toolCalls: [] }; } });
    expect(system).not.toContain('=== Design quality (follow strictly) ===');
  });
  it('parses baseline flag', () => { expect(parseOptions(['--baseline']).baseline).toBe(true); });
});
