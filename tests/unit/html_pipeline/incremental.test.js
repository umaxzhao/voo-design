import { expect, it, vi } from 'vitest';
import { CanvasStreamer } from '../../../src/canvas/agent/html_pipeline/incremental.js';
import { createHistory } from '../../../src/canvas/editor/editor_history.js';
it('diffs create/update/remove by key and commits one undo entry', async () => {
  let doc = { nodes: [] }; const history = createHistory(); history.reset({ doc: JSON.stringify(doc) });
  const push = () => history.push({ doc: JSON.stringify(doc) });
  const editor = { beginBatch: () => history.beginBatch(), endBatch: () => history.endBatch(), commit: vi.fn(push), commitEditorDocument: vi.fn(push), updateNode: vi.fn((id, patch) => { doc = { nodes: doc.nodes.map(n => n.id === id ? { ...n, ...patch } : n) }; push(); }), removeNode: vi.fn(id => { doc = { nodes: doc.nodes.filter(n => n.id !== id) }; push(); }) };
  let count = 0;
  const create = vi.fn((editor, node, parentId) => { const id = String(++count); doc = { nodes: [...doc.nodes, { ...node, id, parentId }] }; editor.commitEditorDocument(); return id; });
  const renderer = { render: vi.fn(async html => html), dispose: vi.fn() };
  const streamer = new CanvasStreamer({ editor, frame: { width: 800, height: 600 }, renderer, convert: nodes => nodes, create });
  streamer.start();
  const a = { key: 'a', type: 'rect', fill: 'red' }, b = { key: 'b', type: 'text', text: 'Hi' };
  await streamer.snapshot([a, b]); await streamer.snapshot([{ ...a, fill: 'blue' }, { key: 'c', type: 'rect' }]); await streamer.flush();
  expect(create).toHaveBeenCalledTimes(4); // frame + a + b + c
  expect(editor.updateNode).toHaveBeenCalledWith('2', expect.objectContaining({ fill: 'blue' }));
  expect(editor.removeNode).toHaveBeenCalledWith('3');
  streamer.finish(); expect(editor.commit).toHaveBeenCalledOnce();
  expect(history.undo()).not.toBeNull(); expect(history.undo()).toBeNull();
});
it('recreates changed native kinds and vector geometry while retaining stable HTML keys', () => {
  const editor = { removeNode: vi.fn(), updateNode: vi.fn() };
  let id = 0; const create = vi.fn(() => String(++id));
  const streamer = new CanvasStreamer({ editor, frame: {}, create, renderer: {} }); streamer.frameId = 'frame';
  streamer.apply([{ key: 'logo', type: 'rect' }]);
  streamer.apply([{ key: 'logo', type: 'path', d: 'M0 0 L10 10' }]);
  streamer.apply([{ key: 'logo', type: 'path', d: 'M0 0 L20 20' }]);
  expect(create).toHaveBeenCalledTimes(3); expect(editor.removeNode).toHaveBeenCalledTimes(2);
  expect(streamer.previous.get('logo').id).toBe('3');
});
it('preserves explicit auto-width and multiline wrapping on creation and updates', () => {
  const editor = { updateNode: vi.fn() };
  const streamer = new CanvasStreamer({ editor, frame: {}, create: () => 'text', renderer: {} });
  const node = { key: 'label', type: 'text', text: 'Product', width: 54, boxWidth: 0 };
  streamer.apply([node]);
  expect(editor.updateNode).toHaveBeenLastCalledWith('text', { boxWidth: 0 });
  streamer.apply([{ ...node, text: 'Log in' }]);
  expect(editor.updateNode).toHaveBeenLastCalledWith('text', expect.objectContaining({ boxWidth: 0 }));
  streamer.apply([{ ...node, boxWidth: 124, width: 124 }]);
  expect(editor.updateNode).toHaveBeenLastCalledWith('text', expect.objectContaining({ boxWidth: 124 }));
});
