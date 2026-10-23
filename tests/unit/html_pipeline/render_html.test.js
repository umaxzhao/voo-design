import { expect, it, vi } from 'vitest';
import { HtmlRenderer } from '../../../src/canvas/agent/html_pipeline/render_html.js';

it('allows slow iframe loads up to eight seconds and still bounds stalled loads', async () => {
  vi.useFakeTimers();
  const doc = { body: { getBoundingClientRect() {} } };
  const iframe = { style: {}, setAttribute() {}, contentDocument: doc };
  const renderer = new HtmlRenderer({ document: { createElement: () => iframe, body: { append() {} } } });
  try {
    const loading = renderer.render('<p>Hello</p>', { width: 480, height: 320 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(iframe.onload).toBeTypeOf('function');
    iframe.onload();
    expect(await loading).toBe(doc);
    const stalled = renderer.render('', { width: 480, height: 320 });
    const rejection = expect(stalled).rejects.toThrow('HTML layout timed out');
    await vi.advanceTimersByTimeAsync(8000);
    await rejection;
    expect(iframe.onload).toBeNull();
  } finally { vi.useRealTimers(); }
});
