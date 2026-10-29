import { getSetting } from '../../../shared/settings.js';
import { runImageJob } from '../image_generation.js';

function imageSizeForFrame(frame) {
  const ratio = Number(frame?.width) / Math.max(1, Number(frame?.height));
  return ratio > 1.15 ? '1536x1024' : ratio < 0.87 ? '1024x1536' : '1024x1024';
}

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Generated image could not be read'));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageDataUrl(url, signal) {
  if (typeof url === 'string' && url.startsWith('data:image/')) return url;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Generated image download failed');
  return toDataUrl(await response.blob());
}

/** Creates the visual reference that the editable design is reconstructed from. */
export async function generateDesignReference({ brief, frame, signal }) {
  const providerId = getSetting('agent.imageProviderId');
  const model = getSetting('agent.imageModelId');
  if (!providerId || !model) return null;
  signal?.throwIfAborted();
  const prompt = [
    'Create one polished visual reference image for a design editor to reconstruct as editable layers.',
    `Canvas ratio ${frame.width}:${frame.height}.`,
    'Show the finished composition only, with clear hierarchy, precise spacing, and intentional details.',
    'Keep text short and legible. Use image areas only for photographs or complex illustrations.',
    `Design brief: ${brief}`,
  ].join('\n');
  const { urls } = await runImageJob({
    providerId,
    request: { model, prompt, n: 1, size: imageSizeForFrame(frame) },
    maxPolls: 24,
    intervalMs: 1500,
    signal,
  });
  const dataUrl = await fetchImageDataUrl(urls[0], signal);
  return { name: 'Generated visual reference', dataUrl };
}

/** Reuses the configured image provider for independent image layers. */
export function configuredImageGenerator() {
  const providerId = getSetting('agent.imageProviderId');
  const model = getSetting('agent.imageModelId');
  if (!providerId || !model || getSetting('agent.confirmBeforeImage') !== false) return null;
  return async ({ prompt, frame, signal }) => {
    signal.throwIfAborted();
    const { urls } = await runImageJob({ providerId, request: { model, prompt, n: 1, size: imageSizeForFrame(frame) }, maxPolls: 12, intervalMs: 1000,
      sleep: ms => new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }) });
    signal.throwIfAborted();
    const response = await fetch(urls[0], { signal });
    if (!response.ok) throw new Error('Generated image download failed');
    const src = await toDataUrl(await response.blob());
    signal.throwIfAborted();
    return { kind: 'image', src, imageId: null, fill: 'none' };
  };
}
