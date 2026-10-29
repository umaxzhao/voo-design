import { expect, it, vi } from 'vitest';
import { generateHtml } from '../../../src/canvas/agent/html_pipeline/generate_html.js';
import { DESIGN_SYSTEM_PRESETS } from '../../../src/canvas/agent/design_system/from_style_kit.js';

const reference = { name: 'poster reference', dataUrl: 'data:image/png;base64,AAAA' };
const direction = { designSystem: Object.values(DESIGN_SYSTEM_PRESETS)[0] };

it('sends visual references to the editable HTML reconstruction model', async () => {
  const html = '<html><body><h1 data-voo-id="title">Concert</h1></body></html>';
  const streamStep = vi.fn().mockResolvedValue({ text: html });

  await generateHtml({
    brief: 'Create a concert poster',
    frame: { width: 600, height: 900 },
    direction,
    streamStep,
    config: {},
    visualReferences: [reference],
  });

  const userContent = streamStep.mock.calls[0][0].messages[1].content;
  expect(userContent[0]).toEqual({ type: 'text', text: 'Create a concert poster' });
  expect(userContent[1]).toEqual({ type: 'image_url', image_url: { url: reference.dataUrl } });
  expect(streamStep.mock.calls[0][0].messages[0].content).toContain('Keep typography, layout, shapes, and controls editable');
});

it('keeps text-only generation when no visual references are available', async () => {
  const html = '<html><body><h1 data-voo-id="title">Concert</h1></body></html>';
  const streamStep = vi.fn().mockResolvedValue({ text: html });

  await generateHtml({
    brief: 'Create a concert poster',
    frame: { width: 600, height: 900 },
    direction,
    streamStep,
    config: {},
  });

  expect(streamStep.mock.calls[0][0].messages[1].content).toBe('Create a concert poster');
});
