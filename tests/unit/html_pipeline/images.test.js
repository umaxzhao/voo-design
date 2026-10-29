import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: new Map(),
  runImageJob: vi.fn(),
}));
vi.mock('../../../src/shared/settings.js', () => ({ getSetting: (key) => mocks.settings.get(key) }));
vi.mock('../../../src/canvas/agent/image_generation.js', () => ({ runImageJob: (...args) => mocks.runImageJob(...args) }));

import { configuredImageGenerator, generateDesignReference } from '../../../src/canvas/agent/html_pipeline/images.js';

beforeEach(() => {
  mocks.settings.clear();
  vi.clearAllMocks();
});

it('creates a frame-shaped reference image with the configured provider', async () => {
  mocks.settings.set('agent.imageProviderId', 'provider');
  mocks.settings.set('agent.imageModelId', 'image-model');
  const reference = 'data:image/png;base64,AAAA';
  mocks.runImageJob.mockResolvedValue({ urls: [reference] });

  const result = await generateDesignReference({
    brief: 'A Bauhaus music poster',
    frame: { width: 600, height: 900 },
    signal: new AbortController().signal,
  });

  expect(mocks.runImageJob).toHaveBeenCalledWith(expect.objectContaining({
    providerId: 'provider',
    request: expect.objectContaining({ model: 'image-model', size: '1024x1536' }),
  }));
  expect(result).toEqual({ name: 'Generated visual reference', dataUrl: reference });
});

it('requires explicit automatic image-slot generation preference for PNG assets', () => {
  mocks.settings.set('agent.imageProviderId', 'provider');
  mocks.settings.set('agent.imageModelId', 'image-model');
  mocks.settings.set('agent.confirmBeforeImage', true);
  expect(configuredImageGenerator()).toBeNull();

  mocks.settings.set('agent.confirmBeforeImage', false);
  expect(configuredImageGenerator()).toEqual(expect.any(Function));
});
