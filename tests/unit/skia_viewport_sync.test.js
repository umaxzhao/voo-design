import { beforeEach, expect, it, vi } from "vitest";

const renderer = vi.hoisted(() => ({
  initialize: vi.fn(), updateResources: vi.fn(), render: vi.fn(),
  waitForResources: vi.fn(), dispose: vi.fn(),
}));
vi.mock("@voo/canvas-core", () => ({
  setCanvasKitAssetUrls: vi.fn(),
  SkiaRenderer: class { constructor() { return renderer; } },
}));
vi.mock("../../src/canvas/editor/skia_scene_adapter.js", () => ({
  documentsToScene: () => [],
}));
import { createSkiaHost } from "../../src/canvas/editor/skia_host.js";

beforeEach(() => vi.clearAllMocks());

it("presents each zoom camera synchronously and resource completion uses the latest camera", async () => {
  let loaded;
  renderer.waitForResources.mockImplementation(() => new Promise(resolve => { loaded = resolve; }));
  const host = await createSkiaHost({});
  const docs = [{ nodes: [] }];
  const first = host.draw({ docs, revision: 1, viewport: { zoom: 1, panX: 10 } });
  expect(renderer.render).toHaveBeenCalledTimes(1);
  for (const zoom of [1.1, 1.3, 0.9]) {
    const frame = host.draw({ docs, revision: 1, viewport: { zoom, panX: zoom * 10 } });
    // Assert before yielding: artwork follows chrome in this animation frame.
    expect(renderer.render.mock.lastCall[1]).toMatchObject({ zoom, panX: zoom * 10 });
    await frame;
  }
  expect(renderer.waitForResources).toHaveBeenCalledTimes(1);
  expect(renderer.render).toHaveBeenCalledTimes(4);
  loaded();
  await first;
  expect(renderer.render.mock.lastCall[1]).toMatchObject({ zoom: 0.9, panX: 9 });
});

it("ignores obsolete resource completions and completions after disposal", async () => {
  const loads = [];
  renderer.waitForResources.mockImplementation(() => new Promise(resolve => loads.push(resolve)));
  const host = await createSkiaHost({});
  const old = host.draw({ docs: [{}], revision: 1, viewport: { zoom: 1 } });
  const next = host.draw({ docs: [{}], revision: 2, viewport: { zoom: 2 } });
  loads[0]();
  await old;
  expect(renderer.render).toHaveBeenCalledTimes(2);
  host.dispose();
  loads[1]();
  await next;
  expect(renderer.render).toHaveBeenCalledTimes(2);
});
