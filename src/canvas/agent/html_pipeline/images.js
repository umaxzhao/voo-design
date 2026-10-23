import { getSetting } from '../../../shared/settings.js';
import { runImageJob } from '../image_generation.js';

/** Reuse the configured canvas image provider without placing extra layers. */
export function configuredImageGenerator() {
  const providerId = getSetting('agent.imageProviderId');
  const model = getSetting('agent.imageModelId');
  // Respect the existing image confirmation preference: automatic fill is optional.
  if (!providerId || !model || getSetting('agent.confirmBeforeImage') !== false) return null;
  return async ({ prompt, signal }) => {
    signal.throwIfAborted();
    const { urls } = await runImageJob({ providerId, request: { model, prompt, n: 1, size: '1024x1024' }, maxPolls: 12, intervalMs: 1000,
      sleep: ms => new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }) });
    signal.throwIfAborted();
    const response = await fetch(urls[0], { signal });
    if (!response.ok) throw new Error('Generated image download failed');
    const blob = await response.blob();
    const src = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
    });
    signal.throwIfAborted();
    return { kind: 'image', src, imageId: null, fill: 'none' };
  };
}
