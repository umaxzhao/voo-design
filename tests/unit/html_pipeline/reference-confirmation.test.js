import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: new Map(), runImageJob: vi.fn(), create: vi.fn(),
}));
vi.mock('../../../src/shared/settings.js', () => ({ getSetting: key => mocks.settings.get(key) }));
vi.mock('../../../src/canvas/agent/image_generation.js', () => ({ runImageJob: (...args) => mocks.runImageJob(...args) }));
vi.mock('../../../src/canvas/agent/canvas_tools.js', () => ({ AGENT_DEFAULTS: { maxSteps: 16 } }));
vi.mock('../../../src/canvas/agent/html_pipeline/render_html.js', () => ({
  HtmlRenderer: class { async render(html) { return html; } dispose() {} },
}));
vi.mock('../../../src/canvas/agent/html_pipeline/html_to_nodes.js', () => ({
  htmlToNodes: () => [{ key: 'headline', type: 'text', text: 'Editable headline', width: 240, height: 32 }],
}));
vi.mock('../../../src/canvas/agent/canvas_tools_build_layout.js', () => ({
  createLayoutNode: (...args) => mocks.create(...args),
}));
vi.mock('../../../src/canvas/agent/html_pipeline/critique.js', () => ({
  critiqueHtml: async ({ html }) => ({ html, repaired: false, trace: [] }),
}));

import { runAgentTurn } from '../../../src/canvas/agent/canvas_agent.js';
import { runHtmlPipeline } from '../../../src/canvas/agent/html_pipeline/pipeline.js';
import { DESIGN_SYSTEM_PRESETS } from '../../../src/canvas/agent/design_system/from_style_kit.js';

const frame = { x: 0, y: 0, width: 800, height: 600 };
const reference = { name: 'Provided reference', dataUrl: 'data:image/png;base64,AAAA' };
const html = '<html><body><h1 data-voo-id="headline">Editable headline</h1></body></html>';
const direction = { id: 'direction', name: 'Clean', mood: 'calm', layoutIdea: 'grid',
  designSystem: Object.values(DESIGN_SYSTEM_PRESETS)[0] };
const directions = [direction, { ...direction, id: 'alternative', name: 'Alternative' }];

function editorFixture() {
  let doc = { width: 800, height: 600, nodes: [] };
  let id = 0;
  const editor = {
    getDocument: () => doc, setDoc: vi.fn(next => { doc = next; }),
    beginBatch: vi.fn(), endBatch: vi.fn(), commit: vi.fn(),
    updateNode: vi.fn(), removeNode: vi.fn(),
  };
  mocks.create.mockImplementation((_editor, node, parentId) => {
    const nodeId = String(++id);
    doc = { ...doc, nodes: [...doc.nodes, { ...node, id: nodeId, parentId }] };
    return nodeId;
  });
  return editor;
}

function streamFixture() {
  // Each variant repeats the real direction/HTML pipeline, while only the
  // external model and browser layout measurement are replaced by fixtures.
  return vi.fn(async ({ messages }) => ({ text:
    messages[0].content.includes('Reconstruct the visual references') ? html : JSON.stringify(directions),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.clear();
  mocks.settings.set('agent.imageProviderId', 'provider');
  mocks.settings.set('agent.imageModelId', 'image-model');
  mocks.runImageJob.mockResolvedValue({ urls: [reference.dataUrl] });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('unexpected-network-request'); }));
});
afterEach(() => { vi.unstubAllGlobals(); });

it.each([undefined, true])('continues editable HTML generation without paid requests when confirmation is %s', async confirmation => {
  if (confirmation !== undefined) mocks.settings.set('agent.confirmBeforeImage', confirmation);
  const editor = editorFixture(), streamStep = streamFixture();
  const result = await runHtmlPipeline({ brief: 'Create a landing page', frame, editor, streamStep });

  expect(result).toMatchObject({ nodeCount: 1, visualReferenceGenerated: false, visualReferenceSource: 'none' });
  expect(editor.getDocument().nodes).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'text', text: 'Editable headline', parentId: result.frameId }),
  ]));
  expect(editor.commit).toHaveBeenCalledOnce();
  expect(mocks.runImageJob).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([true, false])('preserves a provided reference without generating another when confirmation is %s', async confirmation => {
  mocks.settings.set('agent.confirmBeforeImage', confirmation);
  const streamStep = streamFixture();
  const result = await runHtmlPipeline({ brief: 'Create a landing page', frame,
    editor: editorFixture(), streamStep, visualReferences: [reference] });

  expect(result.visualReferenceSource).toBe('provided');
  expect(streamStep.mock.calls[1][0].messages[1].content).toContainEqual({
    type: 'image_url', image_url: { url: reference.dataUrl },
  });
  expect(mocks.runImageJob).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([undefined, true, false])('shares references across actual agent variants and respects confirmation=%s', async confirmation => {
  mocks.settings.set('agent.confirmBeforeImage', confirmation);
  const editor = editorFixture(), streamStep = streamFixture();
  vi.stubGlobal('document', { createElement() {} });
  vi.stubGlobal('window', { __vooEditor: editor });
  const onVariant = vi.fn();
  const reply = await runAgentTurn({
    config: {}, history: [], userText: 'Create a landing page', tools: [], executeTool: vi.fn(),
    streamStep, variantCount: 3, frame, onVariant,
  });

  expect(reply).toContain('3 variants');
  expect(onVariant).toHaveBeenCalledTimes(3);
  expect(mocks.runImageJob).toHaveBeenCalledTimes(confirmation === false ? 1 : 0);
  expect(editor.getDocument().nodes.filter(node => node.type === 'text')).toHaveLength(3);
  const htmlRequests = streamStep.mock.calls.map(([request]) => request)
    .filter(request => request.messages[0].content.includes('Reconstruct the visual references'));
  expect(htmlRequests).toHaveLength(3);
  for (const request of htmlRequests) {
    if (confirmation !== false) expect(request.messages[1].content).toBe('Create a landing page');
    else expect(request.messages[1].content).toContainEqual({ type: 'image_url', image_url: { url: reference.dataUrl } });
  }
  expect(fetch).not.toHaveBeenCalled();
});
