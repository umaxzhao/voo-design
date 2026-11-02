import { expect, it, vi } from 'vitest';
const pipeline = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../../../src/canvas/agent/html_pipeline/pipeline.js', async importOriginal => ({
  ...await importOriginal(), runHtmlPipeline: pipeline.run,
}));
import { runAgentTurn } from '../../../src/canvas/agent/canvas_agent.js';

it.each(['Design contains decorative icons', 'Generation failed'])('surfaces pipeline error without starting tool loop: %s', async message => {
  const editor = { getDocument: () => ({ nodes: [] }) };
  vi.stubGlobal('document', { createElement() {} });
  vi.stubGlobal('window', { __vooEditor: editor });
  vi.stubGlobal('__VOO_DESIGN_QUALITY_OFF__', false);
  vi.stubGlobal('localStorage', { getItem: () => null });
  const streamStep = vi.fn(), executeTool = vi.fn();
  pipeline.run.mockRejectedValueOnce(new Error(message));
  try {
    await expect(runAgentTurn({ userText: 'Create a canvas', history: [], tools: [], streamStep, executeTool })).rejects.toThrow(message);
    expect(streamStep).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
