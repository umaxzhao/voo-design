export class JsonCallError extends Error {
  constructor(trace) { super('Model returned invalid JSON after one retry'); this.name = 'JsonCallError'; this.code = 'htmlPipelineJson'; this.trace = trace; }
}
export function stripFences(raw) { return String(raw ?? '').trim().replace(/^```(?:json|html)?\s*/i, '').replace(/\s*```$/, '').trim(); }
export async function callJson({ streamStep, config, system, user, validate, signal }) {
  const messages = [{ role: 'system', content: `${system}\nReturn ONLY JSON. No markdown, prose, tools, or comments. Follow the requested schema exactly.` }, { role: 'user', content: user }];
  const trace = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    const prompt = structuredClone(messages);
    const { text: raw } = await streamStep({ config, messages, tools: [], signal });
    let result;
    try { const value = JSON.parse(stripFences(raw)); result = validate ? validate(value) : { ok: true, value, errors: [] }; }
    catch (error) { result = { ok: false, errors: [error.message] }; }
    trace.push({ prompt, raw, errors: result.errors ?? [] });
    if (result.ok) return { value: result.value, trace };
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `Correct these errors and return the entire JSON again:\n${JSON.stringify(result.errors)}` });
  }
  throw new JsonCallError(trace);
}
