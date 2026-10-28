import { afterEach, describe, expect, it, vi } from "vitest";
import { pickProjectSource } from "../../src/canvas/store/pick-project-source.js";

function fileSource(name = "Document.voo", bytes = [1, 2, 3]) {
  return { name, arrayBuffer: vi.fn(async () => new Uint8Array(bytes).buffer) };
}

function installInput(onClick) {
  const input = { click: vi.fn(() => onClick(input)) };
  vi.stubGlobal("document", { createElement: vi.fn(() => input) });
  return input;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock("../../src/canvas/store/project_io.js");
  vi.resetModules();
});

describe("project source selection", () => {
  it("starts the native picker synchronously and preserves its handle", async () => {
    const file = fileSource();
    const handle = { kind: "file", getFile: vi.fn(async () => file) };
    const picker = vi.fn(async () => [handle]);
    vi.stubGlobal("window", { showOpenFilePicker: picker });

    const selection = pickProjectSource();
    expect(picker).toHaveBeenCalledOnce();
    expect(await selection).toEqual({ bytes: new Uint8Array([1, 2, 3]), name: file.name, path: null, handle });
  });

  it("returns cancellation without opening a fallback picker", async () => {
    vi.stubGlobal("window", { showOpenFilePicker: vi.fn(async () => {
      throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    }) });
    const input = installInput(() => {});
    expect(await pickProjectSource()).toBeNull();
    expect(input.click).not.toHaveBeenCalled();
  });

  it("reads an explicitly supplied file without showing a picker", async () => {
    const picker = vi.fn();
    vi.stubGlobal("window", { showOpenFilePicker: picker });
    expect(await pickProjectSource({ fileOrPath: fileSource("Dropped.fig") })).toEqual({
      bytes: new Uint8Array([1, 2, 3]), name: "Dropped.fig", path: null, handle: null,
    });
    expect(picker).not.toHaveBeenCalled();
  });

  it("keeps desktop paths and byte views intact", async () => {
    const bytes = new Uint8Array([9, 1, 2, 8]).subarray(1, 3);
    const readFileBytes = vi.fn(async () => bytes);
    vi.stubGlobal("window", { electronAPI: { readFileBytes } });
    const source = await pickProjectSource({ fileOrPath: "C:\\Designs\\Poster.voo" });
    expect(readFileBytes).toHaveBeenCalledWith("C:\\Designs\\Poster.voo");
    expect(source).toEqual({ bytes, name: "Poster.voo", path: "C:\\Designs\\Poster.voo", handle: null });
    expect(source.bytes).toBe(bytes);
  });

  it("keeps Electron dialog cancellation and chosen paths", async () => {
    const openFileDialog = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      bytes: [4, 5], filePath: "/Designs/Poster.voo",
    });
    vi.stubGlobal("window", { electronAPI: { openFileDialog } });
    expect(await pickProjectSource()).toBeNull();
    expect(await pickProjectSource()).toEqual({
      bytes: new Uint8Array([4, 5]), name: "Poster.voo", path: "/Designs/Poster.voo", handle: null,
    });
  });

  it("starts the fallback input synchronously and handles cancellation", async () => {
    vi.stubGlobal("window", {});
    const input = installInput((element) => element.oncancel());
    const selection = pickProjectSource();
    expect(input.click).toHaveBeenCalledOnce();
    expect(await selection).toBeNull();
  });

  it("uses the fallback after a native picker failure and propagates read errors", async () => {
    vi.stubGlobal("window", { showOpenFilePicker: vi.fn(async () => { throw new Error("Unavailable"); }) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = { name: "Broken.voo", arrayBuffer: async () => { throw new Error("Unreadable file"); } };
    installInput((element) => element.onchange({ target: { files: [file] } }));
    await expect(pickProjectSource()).rejects.toThrow("Unreadable file");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("falling back"), expect.any(Error));
  });
});

describe("lazy project entry", () => {
  it("opens the picker before a blocked parser import and passes the original handle", async () => {
    const events = [];
    let releaseParser;
    const gate = new Promise((resolve) => { releaseParser = resolve; });
    const parse = vi.fn(async (options) => ({ success: true, source: options.pickedSource }));
    vi.doMock("../../src/canvas/store/project_io.js", async () => {
      events.push("parser-import");
      await gate;
      return { openVooProject: parse };
    });
    const { openVooProject } = await import("../../src/canvas/store/open-project.js");
    const handle = { kind: "file", getFile: async () => fileSource() };
    vi.stubGlobal("window", { showOpenFilePicker: vi.fn(async () => {
      events.push("picker");
      return [handle];
    }) });

    const opening = openVooProject({ store: {} });
    expect(events).toEqual(["picker"]);
    await vi.waitFor(() => expect(events).toEqual(["picker", "parser-import"]));
    expect(parse).not.toHaveBeenCalled();
    releaseParser();
    const result = await opening;
    expect(result.success).toBe(true);
    expect(result.source.handle).toBe(handle);
    expect(parse).toHaveBeenCalledOnce();
  });

  it("does not load parsers or change document state after cancellation", async () => {
    const importParser = vi.fn(() => { throw new Error("Cancelled selection must not load parsers"); });
    vi.doMock("../../src/canvas/store/project_io.js", importParser);
    const { openVooProject } = await import("../../src/canvas/store/open-project.js");
    vi.stubGlobal("window", { showOpenFilePicker: async () => [] });
    const store = { setDocumentLoading: vi.fn(), loadVooProject: vi.fn() };
    expect(await openVooProject({ store })).toEqual({ canceled: true });
    expect(importParser).not.toHaveBeenCalled();
    expect(store.setDocumentLoading).not.toHaveBeenCalled();
    expect(store.loadVooProject).not.toHaveBeenCalled();
  });
});

describe("selected source parser handoff", () => {
  it("preserves file handles and restores the loading overlay after success", async () => {
    const { openVooProject } = await vi.importActual("../../src/canvas/store/project_io.js");
    const fileHandle = { kind: "file", name: "Chosen.voo" };
    const file = {
      format: "voo-editor", version: 2, kind: "design", assets: {},
      document: { version: 2, width: 10, height: 10, nodes: [], pages: [] },
    };
    const store = { setDocumentLoading: vi.fn(), loadVooProject: vi.fn() };
    vi.stubGlobal("window", { showOpenFilePicker: vi.fn(() => { throw new Error("Source selected already"); }) });
    const result = await openVooProject({ store, pickedSource: {
      bytes: new TextEncoder().encode(JSON.stringify(file)), name: "Chosen.voo", path: null, handle: fileHandle,
    } });
    expect(result.success).toBe(true);
    expect(store.loadVooProject).toHaveBeenCalledWith(expect.objectContaining({
      fileName: "Chosen.voo", fileHandle,
    }));
    expect(window.showOpenFilePicker).not.toHaveBeenCalled();
    expect(store.setDocumentLoading.mock.calls.at(-1)).toEqual([null]);
  });

  it("restores the loading overlay if a selected file cannot be parsed", async () => {
    const { openVooProject } = await vi.importActual("../../src/canvas/store/project_io.js");
    const store = { setDocumentLoading: vi.fn(), loadVooProject: vi.fn() };
    await expect(openVooProject({ store, pickedSource: {
      bytes: new TextEncoder().encode("invalid document"), name: "Broken.voo", path: null, handle: null,
    } })).rejects.toThrow();
    expect(store.loadVooProject).not.toHaveBeenCalled();
    expect(store.setDocumentLoading.mock.calls.at(-1)).toEqual([null]);
  });
});
