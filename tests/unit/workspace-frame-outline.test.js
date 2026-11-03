import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { attachWorkspaceChrome } from "../../src/canvas/use_workspace_chrome.js";

beforeEach(() => {
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

function fixture(root) {
  const context = Object.fromEntries(["save", "restore", "setTransform", "beginPath", "roundRect", "stroke", "clearRect"].map(name => [name, vi.fn()]));
  const listeners = new Set();
  let doc = { isCanvasRoot: root, width: 600, height: 400, nodes: [{ isFrame: true, x: 125, y: 80, width: 600, height: 400 }] };
  let editorCamera = { panX: 30, panY: 40, zoom: 2 };
  const engine = { getDocument: () => doc, renderChrome: vi.fn(), subscribeRender: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  const canvas = { width: 1600, height: 1200, getContext: () => context };
  const stage = { clientWidth: 800, clientHeight: 600 };
  const store = { getState: () => ({ editorCamera }), subscribe: () => () => {} };
  const layout = { x: 100, y: 50, width: 600, height: 400 };
  const connection = attachWorkspaceChrome({ canvas, stage, engine, store, getLayout: () => layout });
  return { context, engine, connection, repaint: () => listeners.forEach(listener => listener()),
    setRoot: root => { doc = { ...doc, isCanvasRoot: root }; }, setCamera: camera => { editorCamera = camera; } };
}

it("leaves real Frame chrome to the engine on an unbounded canvas, without a phantom layout box", () => {
  const f = fixture(true);
  expect(f.engine.renderChrome).toHaveBeenCalledOnce();
  expect(f.context.stroke).not.toHaveBeenCalled();
  f.repaint();
  expect(f.engine.renderChrome).toHaveBeenCalledTimes(2);
  expect(f.context.stroke).not.toHaveBeenCalled();
  f.connection.dispose();
});

it("keeps the bounded page outline synchronized with its camera", () => {
  const f = fixture(false);
  expect(f.context.roundRect).toHaveBeenLastCalledWith(230.5, 140.5, 1199, 799, 0);
  f.setCamera({ panX: -10, panY: 20, zoom: 0.5 }); f.repaint();
  expect(f.context.roundRect).toHaveBeenLastCalledWith(40.5, 45.5, 299, 199, 0);
  expect(f.context.stroke).toHaveBeenCalledTimes(2);
  f.connection.dispose();
});

it("reads the live document flag after reopen instead of caching the old bounded-page state", () => {
  const f = fixture(false);
  expect(f.context.stroke).toHaveBeenCalledOnce();
  f.setRoot(true); f.repaint();
  expect(f.engine.renderChrome).toHaveBeenCalledTimes(2);
  expect(f.context.stroke).toHaveBeenCalledOnce();
  f.connection.dispose();
});
