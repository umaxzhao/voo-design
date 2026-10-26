// Welcome page keeps a single Open/New action set (in the title bar). The
// title bar's New button reaches the dashboard's create-new handler by event.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";

const mocks = vi.hoisted(() => ({
  effects: [],
  refs: new Map(),
  writeFileBytes: vi.fn(async (name) => ({ name, path: `/ws/${name}` })),
  loadVooProject: vi.fn(),
  addRecentFile: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original()),
  // Run hooks outside a renderer: capture effects and keep refs stable per slot.
  useEffect: (fn) => { mocks.effects.push(fn); },
  useRef: (initial) => {
    const slot = mocks.refs.get("create") ?? { current: initial };
    mocks.refs.set("create", slot);
    return slot;
  },
}));
vi.mock("../../src/services/workspace_storage.js", () => ({
  workspaceStorage: { writeFileBytes: mocks.writeFileBytes },
  guessCategory: () => "web",
}));
vi.mock("../../src/store/design_store.js", () => ({
  useDesignStore: { getState: () => ({ loadVooProject: mocks.loadVooProject, newVooProject: vi.fn() }) },
}));
vi.mock("../../src/canvas/store/recent_files.js", () => ({ addRecentFile: mocks.addRecentFile }));

import { useWelcomeCreate } from "../../src/canvas/components/welcome_dashboard/use_welcome_create.js";
import { WELCOME_NEW_EVENT } from "../../src/canvas/components/welcome_dashboard/welcome_events.js";

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

/** Calls the hook as a component would on one render, then mounts its effects. */
function renderHook(fileList, { mount = true } = {}) {
  mocks.effects.length = 0;
  const reloadFiles = vi.fn(async () => {});
  const setWelcomeOpen = vi.fn();
  const api = useWelcomeCreate({ t: (key) => key, fileList, reloadFiles, setWelcomeOpen });
  const cleanups = mount ? mocks.effects.map((effect) => effect()) : [];
  return { api, reloadFiles, setWelcomeOpen, cleanups };
}

describe("welcome page header no longer duplicates the title bar actions", () => {
  it("renders no Open or New button in the dashboard header", () => {
    const src = source("../../src/canvas/components/welcome_dashboard.jsx");
    expect(src).not.toContain('t("welcome.header.open")');
    expect(src).not.toContain('t("welcome.header.new")');
    expect(src).not.toMatch(/onClick=\{\(\) => handle(OpenLocal|CreateNew)\(\)\}/);
    // The trash-only action stays in the header.
    expect(src).toContain('t("welcome.actions.emptyTrash")');
  });
});

describe("title bar New on the welcome page", () => {
  let target;
  beforeEach(() => {
    mocks.refs.clear();
    mocks.writeFileBytes.mockClear();
    mocks.loadVooProject.mockClear();
    target = new EventTarget();
    vi.stubGlobal("window", target);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("creates a design through the same handler as handleCreateNew", async () => {
    const { reloadFiles, setWelcomeOpen, api } = renderHook([]);
    target.dispatchEvent(new Event(WELCOME_NEW_EVENT));
    await vi.waitFor(() => expect(setWelcomeOpen).toHaveBeenCalledWith(false));
    expect(mocks.writeFileBytes).toHaveBeenCalledTimes(1);
    expect(mocks.writeFileBytes.mock.calls[0][0]).toBe("Design1.voo");
    expect(mocks.loadVooProject).toHaveBeenCalledTimes(1);
    expect(reloadFiles).toHaveBeenCalledTimes(1);

    // Calling the handler directly yields the identical write.
    mocks.writeFileBytes.mockClear();
    await api.handleCreateNew();
    expect(mocks.writeFileBytes.mock.calls[0][0]).toBe("Design1.voo");
  });

  it("uses the latest file list so names stay unique, and unsubscribes on cleanup", async () => {
    const first = renderHook([]);
    // Re-render with a new file list; effects do not re-run (empty deps), only the ref updates.
    renderHook([{ name: "Design1.voo" }, { name: "Design2.voo" }], { mount: false });
    target.dispatchEvent(new Event(WELCOME_NEW_EVENT));
    await vi.waitFor(() => expect(mocks.writeFileBytes).toHaveBeenCalledTimes(1));
    expect(mocks.writeFileBytes.mock.calls[0][0]).toBe("Design3.voo");

    mocks.writeFileBytes.mockClear();
    first.cleanups.forEach((cleanup) => cleanup?.());
    target.dispatchEvent(new Event(WELCOME_NEW_EVENT));
    await Promise.resolve();
    expect(mocks.writeFileBytes).not.toHaveBeenCalled();
  });
});
