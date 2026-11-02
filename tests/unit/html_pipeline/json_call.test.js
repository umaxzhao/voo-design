import { expect, it, vi } from 'vitest';
import { callJson, JsonCallError } from '../../../src/canvas/agent/html_pipeline/json_call.js';
it('strips fences and retries exactly once with validation errors', async () => {
  const streamStep = vi.fn().mockResolvedValueOnce({ text: '{"n":0}' }).mockResolvedValueOnce({ text: '```json\n{"n":2}\n```' });
  const result = await callJson({ streamStep, system: 'Count', user: 'two', validate: v => ({ ok: v.n === 2, value: v, errors: v.n === 2 ? [] : ['n must equal 2'] }) });
  expect(result.value.n).toBe(2); expect(result.trace).toHaveLength(2);
  expect(result.trace[1].prompt.at(-1).content).toContain('n must equal 2');
  expect(streamStep).toHaveBeenCalledTimes(2);
});
it('throws typed error after exactly two invalid responses', async () => {
  const streamStep = vi.fn().mockResolvedValue({ text: 'oops' });
  await expect(callJson({ streamStep, system: '', user: '' })).rejects.toBeInstanceOf(JsonCallError);
  expect(streamStep).toHaveBeenCalledTimes(2);
});
it('propagates transport failure without retry', async () => {
  const streamStep = vi.fn().mockRejectedValue(new Error('offline'));
  await expect(callJson({ streamStep, system: '', user: '' })).rejects.toThrow('offline');
  expect(streamStep).toHaveBeenCalledTimes(1);
});
