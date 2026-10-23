import { expect, it, vi } from 'vitest';
import { critiqueHtml, validateCritique, validatePatches } from '../../../src/canvas/agent/html_pipeline/critique.js';
it('attaches a real canvas PNG in the same image message shape as canvas capture', async () => {
  const dataUrl = 'data:image/png;base64,real-canvas-pixels';
  const toDataURL = vi.fn(() => dataUrl);
  const editor = { renderComposite: vi.fn(() => ({ toDataURL })) };
  const streamStep = vi.fn(async () => ({ text: '{"score":4,"issues":[]}' }));
  const result = await critiqueHtml({ editor, frameId: 'frame', brief: 'Landing page', html: '<body>Hi</body>', streamStep });
  expect(result.repaired).toBe(false); expect(streamStep).toHaveBeenCalledOnce();
  expect(streamStep.mock.calls[0][0].messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: dataUrl } });
  expect(toDataURL).toHaveBeenCalledWith('image/png');
});
it('enforces bounded critique scores and narrow repair schema', () => {
  expect(validateCritique({ score: 5, issues: [] }).ok).toBe(true);
  expect(validateCritique({ score: 6, issues: [] }).ok).toBe(false);
  expect(validateCritique({ score: 3, issues: [{ id: 'x', problem: 'Clipped', fix: 'Increase padding' }] }).ok).toBe(true);
  expect(validatePatches({ patches: [{ id: 'x', html: '<div data-voo-id="x">Fixed</div>' }] }).ok).toBe(true);
  expect(validatePatches({ patches: [{ html: 'Missing ID' }] }).ok).toBe(false);
});
