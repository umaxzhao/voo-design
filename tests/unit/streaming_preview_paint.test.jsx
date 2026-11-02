import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ effect: null, refs: [], ready: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original(), useEffect: (fn) => { state.effect = fn; }, useState: () => [false, state.ready], useRef: () => state.refs.shift() }));
const parse = vi.hoisted(() => vi.fn());
const draw = vi.hoisted(() => vi.fn());
vi.mock("../../src/canvas/editor/html_import.js", () => ({ incrementalHtmlToDocument: parse }));
vi.mock("../../src/canvas/editor/scene_renderer.js", () => ({ draw }));
import StreamingLayoutPreview from "../../src/canvas/components/streaming_layout_preview.jsx";

describe("streaming preview painter", () => {
  let cleanup;
  let images;
  let context;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    vi.clearAllMocks();
    images = [];
    context = { drawImage: vi.fn() };
    const canvas = { getContext: () => context, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 720 }) };
    state.refs = [{ current: canvas }, { current: null }, { current: null }, { current: null }, { current: null }];
    state.latest = state.refs[4];
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => context }) });
    vi.stubGlobal("Image", class { constructor() { images.push(this); } });
  });
  afterEach(() => { cleanup?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  const mount = (html) => {
    StreamingLayoutPreview({ previewHtml: html, width: 640, height: 720, t: (key) => key });
    cleanup = state.effect();
  };
  it("keeps the skeleton while planning has no renderable nodes", () => {
    parse.mockReturnValue({ doc: { nodes: [] } });
    mount("<style>");
    vi.advanceTimersByTime(300);
    expect(draw).not.toHaveBeenCalled();
    expect(state.ready).not.toHaveBeenCalled();
  });
  it("paints an image placeholder, repaints unchanged HTML on load, and cleans up", () => {
    parse.mockImplementation(() => ({ doc: { width: 640, height: 720, nodes: [{ id: "hero", kind: "image", x: 0, y: 0, width: 100, height: 100, src: "hero.png" }] } }));
    mount('<img src="hero.png">');
    expect(draw.mock.calls[0][1].doc.nodes[0]).toMatchObject({ kind: "rect", fill: "#e8e9ed" });
    images[0].onload();
    vi.advanceTimersByTime(100);
    const options = draw.mock.calls.at(-1)[1];
    expect(options.doc.nodes[0].kind).toBe("image");
    expect(options.bitmapOf(options.doc.nodes[0])).toBe(images[0]);
    cleanup(); cleanup = null;
    expect(images[0].onload).toBeNull();
    expect(images[0].src).toBe("");
  });
  it("reveals new nodes from top to bottom without changing paint order", () => {
    window.matchMedia = () => ({ matches: false });
    parse.mockImplementation(() => ({ doc: { width: 640, height: 720, nodes: [
      { id: "bottom", kind: "rect", x: 0, y: 300 },
      { id: "top", kind: "rect", x: 0, y: 0 },
    ] } }));
    mount("<div>layout</div>");
    vi.advanceTimersByTime(100);
    const nodes = draw.mock.calls.at(-1)[1].doc.nodes;
    expect(nodes.map((node) => node.id)).toEqual(["bottom", "top"]);
    expect(nodes[1].opacity).toBeGreaterThan(nodes[0].opacity);
    vi.advanceTimersByTime(300);
    expect(draw.mock.calls.at(-1)[1].doc.nodes.every((node) => node.opacity === 1)).toBe(true);
  });

  it("keeps the last good frame when the next partial parse fails", () => {
    parse.mockReturnValueOnce({ doc: { width: 640, height: 720, nodes: [{ id: "a", kind: "rect", x: 0, y: 0 }] } }).mockImplementation(() => { throw new Error("partial"); });
    mount("<div>");
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    state.latest.current.previewHtml = "<div>partial";
    vi.advanceTimersByTime(100);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });
});
