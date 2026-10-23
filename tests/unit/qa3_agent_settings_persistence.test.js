import { afterEach, expect, it, vi } from 'vitest';
import { AGENT_SETTING } from '../../src/canvas/agent/canvas_tools.js';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('restores the selected agent and generation preferences after a fresh load', async () => {
  const storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  });
  vi.stubGlobal('chrome', undefined);
  vi.resetModules();
  const first = await import('../../src/shared/settings.js');
  const values = Object.fromEntries(Object.values(AGENT_SETTING).map(key => [key, `qa-${key}`]));
  for (const [key, value] of Object.entries(values)) await first.setSetting(key, value);
  vi.resetModules();
  const reloaded = await import('../../src/shared/settings.js');
  // Report only setting names, never credential values, on failures.
  for (const [key, value] of Object.entries(values)) {
    expect(reloaded.getSetting(key) === value, `Setting restored: ${key}`).toBe(true);
  }
});
