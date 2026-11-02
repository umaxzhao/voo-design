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
  mocks.settings.set('agent.confirmBeforeImage', false);
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

it.each([undefined, true, null])('does not generate a paid reference when confirmation is %s', async confirmation => {
  mocks.settings.set('agent.imageProviderId', 'provider');
  mocks.settings.set('agent.imageModelId', 'image-model');
  if (confirmation !== undefined) mocks.settings.set('agent.confirmBeforeImage', confirmation);
  mocks.runImageJob.mockResolvedValue({ urls: ['data:image/png;base64,AAAA'] });

  const result = await generateDesignReference({
    brief: 'Create a page', frame: { width: 800, height: 600 }, signal: new AbortController().signal,
  });

  expect(result).toBeNull();
  expect(mocks.runImageJob).not.toHaveBeenCalled();
});

it('honors cancellation before an explicitly enabled automatic reference request', async () => {
  mocks.settings.set('agent.imageProviderId', 'provider');
  mocks.settings.set('agent.imageModelId', 'image-model');
  mocks.settings.set('agent.confirmBeforeImage', false);
  const controller = new AbortController();
  controller.abort(new Error('request-cancelled'));

  await expect(generateDesignReference({
    brief: 'Create a page', frame: { width: 800, height: 600 }, signal: controller.signal,
  })).rejects.toThrow('request-cancelled');
  expect(mocks.runImageJob).not.toHaveBeenCalled();
});

it('requires explicit automatic image-slot generation preference for PNG assets', () => {
  mocks.settings.set('agent.imageProviderId', 'provider');
  mocks.settings.set('agent.imageModelId', 'image-model');
  mocks.settings.set('agent.confirmBeforeImage', true);
  expect(configuredImageGenerator()).toBeNull();

  mocks.settings.set('agent.confirmBeforeImage', false);
  expect(configuredImageGenerator()).toEqual(expect.any(Function));
});
