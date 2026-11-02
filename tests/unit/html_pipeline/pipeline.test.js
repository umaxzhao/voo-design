import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ render: vi.fn(), convert: vi.fn(), create: vi.fn(), critique: vi.fn(), repair: vi.fn(), imageGenerator: vi.fn(), referenceGenerator: vi.fn(async () => null) }));
vi.mock('../../../src/canvas/agent/html_pipeline/render_html.js', () => ({ HtmlRenderer: class { render(...args) { return mocks.render(...args); } dispose() {} } }));
vi.mock('../../../src/canvas/agent/html_pipeline/html_to_nodes.js', () => ({ htmlToNodes: (...args) => mocks.convert(...args) }));
vi.mock('../../../src/canvas/agent/canvas_tools_build_layout.js', () => ({ createLayoutNode: (...args) => mocks.create(...args) }));
vi.mock('../../../src/canvas/agent/html_pipeline/critique.js', () => ({ critiqueHtml: (...args) => mocks.critique(...args), repairHtml: (...args) => mocks.repair(...args) }));
vi.mock('../../../src/canvas/agent/html_pipeline/images.js', () => ({ configuredImageGenerator: () => null, generateDesignReference: (...args) => mocks.referenceGenerator(...args) }));
import { runHtmlPipeline, shouldUseHtmlPipeline } from '../../../src/canvas/agent/html_pipeline/pipeline.js';
import { DESIGN_SYSTEM_PRESETS } from '../../../src/canvas/agent/design_system/from_style_kit.js';
const directions = Object.values(DESIGN_SYSTEM_PRESETS).slice(0, 2).map((designSystem, i) => ({ id: String(i), name: designSystem.name, mood: 'calm', layoutIdea: 'grid', designSystem }));
beforeEach(() => { vi.clearAllMocks(); mocks.render.mockImplementation(async html => html); mocks.convert.mockReturnValue([{ key: 'headline', type: 'text', text: 'Hi' }]); let id = 0; mocks.create.mockImplementation(() => String(++id)); });
it('orchestrates selection, live snapshots, saved tokens and a single repair', async () => {
  let doc = { nodes: [], width: 800, height: 600 };
  const editor = { getDocument: () => doc, setDoc: vi.fn(next => { doc = next; }), beginBatch: vi.fn(), endBatch: vi.fn(), commit: vi.fn(), updateNode: vi.fn(), removeNode: vi.fn() };
  const html = '<html><body><h1 data-voo-id="headline">Hi</h1></body></html>';
  const streamStep = vi.fn().mockResolvedValueOnce({ text: JSON.stringify(directions) }).mockImplementationOnce(async ({ onText }) => { onText('<html><body><h1>Hi'); return { text: html }; });
  mocks.critique.mockResolvedValue({ html: html.replace('Hi', 'Repaired'), repaired: true, trace: [{ raw: 'review' }] });
  const chooseDirection = vi.fn(() => '1'), onProgress = vi.fn();
  const result = await runHtmlPipeline({ brief: 'Create a page', frame: { width: 800, height: 600 }, editor, streamStep, config: {}, onProgress, chooseDirection });
  expect(result.directionId).toBe('1'); expect(result.nodeCount).toBe(1); expect(result.html).toContain('Repaired');
  expect(doc.designSystem.id).toBe(directions[1].designSystem.id);
  expect(mocks.render.mock.calls.at(-1)[0]).toContain('Repaired');
  expect(editor.commit).toHaveBeenCalledOnce(); expect(editor.endBatch).toHaveBeenCalledOnce();
  expect(onProgress).toHaveBeenCalledWith({ stage: 'repair', status: 'completed' });
});
it('generates a visual reference before HTML and sends it to reconstruction', async () => {
  const image = { name: 'Visual reference', dataUrl: 'data:image/png;base64,AAAA' };
  const html = '<html><body><h1 data-voo-id="headline">Concert</h1></body></html>';
  const order = [];
  const streamStep = vi.fn()
    .mockImplementationOnce(async () => ({ text: JSON.stringify(directions) }))
    .mockImplementationOnce(async ({ messages }) => {
      order.push('html');
      expect(messages[1].content[1].image_url.url).toBe(image.dataUrl);
      return { text: html };
    });
  const editor = { getDocument: () => ({ nodes: [] }), setDoc: vi.fn(), beginBatch: vi.fn(), endBatch: vi.fn(), commit: vi.fn(), updateNode: vi.fn(), removeNode: vi.fn() };
  mocks.critique.mockResolvedValue({ html, repaired: false, trace: [] });
  const result = await runHtmlPipeline({
    brief: 'Create a concert poster',
    frame: { width: 600, height: 900 },
    editor,
    streamStep,
    config: { htmlReferenceGenerator: async () => { order.push('reference'); return image; } },
  });

  expect(order).toEqual(['reference', 'html']);
  expect(result.visualReferenceGenerated).toBe(true);
});

it('uses a user-provided reference image instead of generating another', async () => {
  const image = { name: 'Provided reference', dataUrl: 'data:image/png;base64,BBBB' };
  const html = '<html><body><h1 data-voo-id="headline">Concert</h1></body></html>';
  const referenceGenerator = vi.fn();
  const streamStep = vi.fn()
    .mockResolvedValueOnce({ text: JSON.stringify(directions) })
    .mockImplementationOnce(async ({ messages }) => {
      expect(messages[1].content[1].image_url.url).toBe(image.dataUrl);
      return { text: html };
    });
  const editor = { getDocument: () => ({ nodes: [] }), setDoc: vi.fn(), beginBatch: vi.fn(), endBatch: vi.fn(), commit: vi.fn(), updateNode: vi.fn(), removeNode: vi.fn() };
  mocks.critique.mockResolvedValue({ html, repaired: false, trace: [] });

  const result = await runHtmlPipeline({
    brief: 'Create a concert poster',
    frame: { width: 600, height: 900 },
    editor,
    streamStep,
    config: { htmlReferenceGenerator: referenceGenerator },
    visualReferences: [image],
  });

  expect(referenceGenerator).not.toHaveBeenCalled();
  expect(result.visualReferenceSource).toBe('provided');
});

it('replaces complex visual placeholders with independent image layers', async () => {
  const imageLayer = { kind: 'image', src: 'data:image/png;base64,AAAA' };
  const imageGenerator = vi.fn(async () => imageLayer);
  const html = '<html><body><div data-voo-id="cover-art">Album art</div></body></html>';
  const streamStep = vi.fn()
    .mockResolvedValueOnce({ text: JSON.stringify(directions) })
    .mockResolvedValueOnce({ text: html });
  const editor = { getDocument: () => ({ nodes: [] }), setDoc: vi.fn(), beginBatch: vi.fn(), endBatch: vi.fn(), commit: vi.fn(), updateNode: vi.fn(), removeNode: vi.fn() };
  mocks.convert.mockReturnValue([{ key: 'cover-art', type: 'rect', width: 320, height: 180, imagePrompt: 'abstract album cover' }]);
  mocks.critique.mockResolvedValue({ html, repaired: false, trace: [] });

  await runHtmlPipeline({
    brief: 'Create a music page',
    frame: { width: 800, height: 600 },
    editor,
    streamStep,
    config: { htmlReferenceGenerator: async () => null, htmlImageGenerator: imageGenerator },
  });

  expect(imageGenerator).toHaveBeenCalledWith(expect.objectContaining({
    prompt: 'abstract album cover',
    frame: { width: 320, height: 180 },
  }));
  expect(editor.updateNode).toHaveBeenCalledWith('2', imageLayer);
});

it('restores history entry points after aborted generation', async () => {
  const controller = new AbortController(); const commit = vi.fn();
  const editor = { getDocument: () => ({ nodes: [] }), setDoc: vi.fn(), beginBatch: vi.fn(), endBatch: vi.fn(), commit };
  const streamStep = vi.fn().mockResolvedValueOnce({ text: JSON.stringify(directions) }).mockImplementationOnce(() => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); });
  await expect(runHtmlPipeline({ brief: 'page', frame: { width: 800, height: 600 }, editor, streamStep, signal: controller.signal })).rejects.toThrow('Aborted');
  expect(editor.commit).toBe(commit); expect(editor.endBatch).toHaveBeenCalledOnce();
});
it('requires a browser, explicit generation intent and empty document', () => {
  const previous = globalThis.document; globalThis.document = { createElement() {} };
  const editor = { getDocument: () => ({ nodes: [] }) };
  expect(shouldUseHtmlPipeline({ editor, userText: 'Create a landing page' })).toBe(true);
  expect(shouldUseHtmlPipeline({ editor, userText: 'Fix the existing page' })).toBe(false);
  expect(shouldUseHtmlPipeline({ editor, userText: 'Create a page', enabled: false })).toBe(false);
  expect(shouldUseHtmlPipeline({ editor: { getDocument: () => ({ nodes: [{ kind: 'text' }] }) }, userText: 'Create a page' })).toBe(false);
  expect(shouldUseHtmlPipeline({ editor: { getDocument: () => ({ nodes: [{ kind: 'rect' }] }) }, userText: 'Create a page' })).toBe(false);
  expect(shouldUseHtmlPipeline({ editor, userText: 'Move and rename' })).toBe(false);
  expect(shouldUseHtmlPipeline({ editor, userText: 'Inspect the page' })).toBe(false);
  if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
});

it.each(['canvas', 'ui', 'layout', 'form', 'card', 'screen', 'page', 'website', 'dashboard', 'landing', 'app', 'interface', 'poster', 'modal', 'home', 'hero'])('routes empty-document %s creation to HTML', noun => {
  vi.stubGlobal('document', { createElement() {} });
  try {
    const editor = { getDocument: () => ({ nodes: [] }) };
    for (const verb of ['create', 'build', 'design', 'generate', 'make']) {
      expect(shouldUseHtmlPipeline({ editor, userText: `${verb} a ${noun}` })).toBe(true);
      for (const edit of ['edit', 'refine', 'fix', 'update', 'existing']) {
        expect(shouldUseHtmlPipeline({ editor, userText: `${verb} a ${noun} ${edit}` })).toBe(false);
      }
    }
  } finally { vi.unstubAllGlobals(); }
});
it.each([false, true])('repairs decorative hard failures once, persistent failure: %s', async persistent => {
  const dirty = '<html><body><h1 data-voo-id="headline">Hi ★</h1></body></html>';
  const clean = dirty.replace(' ★', '');
  const editor = { getDocument: () => ({ nodes: [] }), setDoc: vi.fn(), beginBatch: vi.fn(), endBatch: vi.fn(), commit: vi.fn(), updateNode: vi.fn(), removeNode: vi.fn() };
  const streamStep = vi.fn().mockResolvedValueOnce({ text: JSON.stringify(directions) }).mockResolvedValueOnce({ text: dirty });
  mocks.critique.mockResolvedValue({ html: dirty, repaired: true, trace: [] });
  mocks.repair.mockResolvedValue({ html: persistent ? dirty : clean, trace: [] });
  const run = runHtmlPipeline({ brief: 'Create a canvas', frame: { width: 800, height: 600 }, editor, streamStep });
  if (persistent) await expect(run).rejects.toThrow('Design contains decorative icons');
  else {
    await expect(run).resolves.toMatchObject({ html: clean });
    expect(mocks.render.mock.calls.at(-1)[0]).toBe(clean);
  }
  expect(mocks.repair).toHaveBeenCalledOnce();
  expect(mocks.repair.mock.calls[0][0].issues).toEqual(expect.arrayContaining([expect.objectContaining({ hard: true })]));
  expect(editor.endBatch).toHaveBeenCalledOnce();
});
