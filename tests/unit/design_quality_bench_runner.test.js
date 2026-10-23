import { describe, expect, it } from 'vitest';
import { parseOptions } from '../../scripts/design-bench/run.mjs';
import { JUDGE_DIMENSIONS, parseJudgeOutput, scoreDocument } from '../../scripts/design-bench/score.mjs';
import { formatReport } from '../../scripts/design-bench/report.mjs';

describe('design benchmark controls', () => {
  it('selects tasks and model with both CLI argument forms', () => {
    expect(parseOptions(['--model', 'gpt-6-astra', '--tasks=login-form,mobile-home', '--label=before', '--critique'])).toMatchObject({
      model: 'gpt-6-astra', selectedTasks: ['login-form', 'mobile-home'], label: 'before', critique: true,
    });
    expect(parseOptions(['--model=codex:example']).model).toBe('codex:example');
    expect(parseOptions([]).selectedTasks).toHaveLength(20);
  });
  it('rejects bad selection before launching processes or writing artifacts', () => {
    for (const args of [['--tasks=missing'], ['--tasks=signup,signup'], ['--model'], ['--label=elsewhere'], ['--unknown'], ['--judge=false']]) {
      expect(() => parseOptions(args)).toThrow();
    }
  });
  it('requires every judge dimension to be an integer on the rubric scale', () => {
    const scores = Object.fromEntries(JUDGE_DIMENSIONS.map(key => [key, 4]));
    expect(parseJudgeOutput(`\`\`\`json\n${JSON.stringify(scores)}\n\`\`\``)).toEqual(scores);
    expect(() => parseJudgeOutput(JSON.stringify({ ...scores, aiSmell: 0 }))).toThrow();
    expect(() => parseJudgeOutput(JSON.stringify({ hierarchy: 5 }))).toThrow();
    expect(() => parseJudgeOutput('Image unavailable')).toThrow();
  });
  it('supports scoring a persisted document without the optional linter', async () => {
    expect(await scoreDocument({ nodes: [] }, { lint: null })).toEqual({ lint: null });
    const lint = (doc, options) => ({ score: doc.nodes.length, rootId: options.rootId });
    expect(await scoreDocument({ nodes: [{ id: 'a' }] }, { lint, rootId: 'a' })).toEqual({ lint: { score: 1, rootId: 'a' } });
  });
  it('shows comparable scores, deltas and missing/failed runs', () => {
    const before = { tasks: [{ id: 'signup', lint: { score: 60 } }, { id: 'login-form', error: 'timeout' }] };
    const after = { tasks: [{ id: 'signup', lint: { score: 85 } }] };
    expect(formatReport(before, after)).toContain('| signup | 60 | 85 | +25 |');
    expect(formatReport(before, after)).toContain('before failed');
    expect(formatReport(null, after)).toContain('missing run');
  });
});
