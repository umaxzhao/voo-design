export class HtmlRenderer {
  constructor({ document: host = globalThis.document } = {}) { this.host = host; }
  async render(html, frame, signal) {
    signal?.throwIfAborted();
    if (!this.iframe) {
      this.iframe = this.host.createElement('iframe');
      this.iframe.setAttribute('sandbox', 'allow-same-origin');
      this.iframe.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;border:0;pointer-events:none';
      this.host.body.append(this.iframe);
    }
    const iframe = this.iframe;
    iframe.style.width = `${frame.width}px`; iframe.style.height = `${frame.height}px`;
    await new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); iframe.onload = null; signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
      const abort = () => finish(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('HTML layout timed out')), 2000);
      iframe.onload = () => finish(); signal?.addEventListener('abort', abort, { once: true });
      // CSP enforces offline rendering even if the model ignores its prompt.
      iframe.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'">${html}`;
    });
    const doc = iframe.contentDocument;
    await Promise.race([doc.fonts?.ready ?? Promise.resolve(), new Promise(resolve => setTimeout(resolve, 200))]);
    signal?.throwIfAborted();
    doc.body.getBoundingClientRect();
    return doc;
  }
  dispose() { this.iframe?.remove(); this.iframe = null; }
}
export async function renderHtml(html, frame, options = {}) {
  const renderer = options.renderer ?? new HtmlRenderer(options);
  return renderer.render(html, frame, options.signal);
}
