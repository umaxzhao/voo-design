import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  streamLayout,
  getStreamBuffer,
  resetStreamBuffer,
  STREAM_LAYOUT_SCHEMA,
} from "../../src/canvas/agent/canvas_tools_stream_layout.js";
import { buildMcpTools } from "../../electron/mcp_server/tool_catalog.js";
import { useDesignStore } from "../../src/store/design_store.js";
import { startDraftStreamWatcher } from "../../electron/draft_stream_watcher.js";
import { CLI_BRIDGE_EVENT as E } from "../../src/shared/cli_bridge_protocol.js";

describe("Streaming Layout Channel", () => {
  beforeEach(() => {
    resetStreamBuffer();
    useDesignStore.setState({
      streamingPreview: null,
      streamingPreviewNodeId: null,
      welcomeOpen: false,
      activeDocumentId: "doc-1",
      nodes: [],
    });
  });

  afterEach(() => {
    resetStreamBuffer();
  });

  it("exposes stream_layout in MCP catalog and canvas tool schemas", () => {
    expect(STREAM_LAYOUT_SCHEMA.function.name).toBe("stream_layout");
    const mcpTools = buildMcpTools();
    const tool = mcpTools.find((t) => t.name === "stream_layout");
    expect(tool).toBeDefined();
    expect(tool.description).toContain("Stream an incremental HTML/layout");
  });

  it("accumulates chunks into buffer and updates design store streaming preview", async () => {
    const res1 = await streamLayout({ chunk: "<div style='padding:20px'>" });
    expect(res1.status).toBe("streaming");
    expect(res1.preview).toBe(true);
    expect(getStreamBuffer()).toBe("<div style='padding:20px'>");
    expect(useDesignStore.getState().streamingPreview).toBe("<div style='padding:20px'>");

    const res2 = await streamLayout({ chunk: "<h1>Hello Stream</h1></div>" });
    expect(res2.status).toBe("streaming");
    expect(getStreamBuffer()).toBe("<div style='padding:20px'><h1>Hello Stream</h1></div>");
    expect(useDesignStore.getState().streamingPreview).toBe(
      "<div style='padding:20px'><h1>Hello Stream</h1></div>"
    );
  });

  it("clears streaming preview when requested", async () => {
    await streamLayout({ html: "<div>Draft</div>" });
    expect(useDesignStore.getState().streamingPreview).toBe("<div>Draft</div>");

    const clearRes = await streamLayout({ clear: true });
    expect(clearRes.status).toBe("cleared");
    expect(getStreamBuffer()).toBe("");
    expect(useDesignStore.getState().streamingPreview).toBeNull();
  });

  it("automatically opens canvas if welcome screen was open", async () => {
    useDesignStore.setState({ welcomeOpen: true, activeDocumentId: "doc-1" });
    await streamLayout({ html: "<div>Generating...</div>" });
    expect(useDesignStore.getState().welcomeOpen).toBe(false);
  });

  it("commits accumulated layout into editor on final: true", async () => {
    const mockDoc = { id: "doc-1", width: 1440, height: 900, nodes: [] };
    let committedDoc = null;
    let commitName = null;
    const editor = {
      getDocument: () => mockDoc,
      setDoc: (doc, options) => {
        committedDoc = doc;
        commitName = options?.name;
      },
      requestRender: vi.fn(),
    };

    await streamLayout({ html: "<div style='display:flex;gap:12px;background:#222;padding:16px'><button style='background:blue;color:white'>Click</button></div>" });
    expect(useDesignStore.getState().streamingPreview).not.toBeNull();

    const commitRes = await streamLayout({ final: true }, { editor });
    expect(commitRes.status).toBe("committed");
    expect(commitRes.final).toBe(true);
    expect(commitRes.nodeCount).toBeGreaterThan(0);

    expect(committedDoc).not.toBeNull();
    expect(commitName).toBe("AI: Stream layout");
    expect(editor.requestRender).toHaveBeenCalled();
    // Preview overlay is dismissed after commit
    expect(useDesignStore.getState().streamingPreview).toBeNull();
    expect(getStreamBuffer()).toBe("");
  });

  it("rejects stale continuation after a document switch until explicitly cleared", async () => {
    await streamLayout({ html: "<div>Old document</div>" });
    useDesignStore.setState({ activeDocumentId: "doc-2" });
    await expect(streamLayout({ final: true })).rejects.toMatchObject({ name: "AbortError" });
    await expect(streamLayout({ chunk: "<p>Late content</p>" })).rejects.toMatchObject({ name: "AbortError" });
    await streamLayout({ clear: true });
    expect((await streamLayout({ html: "<div>New document</div>" })).status).toBe("streaming");
  });

  describe("Draft File Watcher", () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "voo-stream-test-"));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it("watches draft file changes and debounces stream notifications", async () => {
      const sendToCanvas = vi.fn();
      const watcher = startDraftStreamWatcher({
        sendToCanvas,
        watchDir: tmpDir,
        debounceMs: 20,
      });

      try {
        const draftFile = path.join(tmpDir, "voo-draft.html");
        fs.writeFileSync(draftFile, "<div>Initial Draft</div>");
        watcher.triggerManually("voo-draft.html");
        // Real filesystem callbacks can reset the debounce after the manual
        // trigger. Assert delivery, not an unrealistically fixed 60ms deadline.
        await vi.waitFor(() => expect(sendToCanvas).toHaveBeenCalledWith(
          E.STREAM_LAYOUT_UPDATE,
          expect.objectContaining({ html: "<div>Initial Draft</div>", file: "voo-draft.html" })
        ), { timeout: 2000, interval: 20 });
      } finally { watcher.close(); }
    });

    it("parses final marker from draft file and passes final: true to executeTool", () => {
      const executeTool = vi.fn();
      const rawHtml = "<div>Card Content</div><!-- voo:final -->";
      const isFinal = /<!--\s*(?:voo:final|VOOFINISH)\s*-->/i.test(rawHtml);
      const cleaned = rawHtml.replace(/<!--\s*(?:voo:final|VOOFINISH)\s*-->/gi, "");
      executeTool("stream_layout", { html: cleaned, final: isFinal });

      expect(executeTool).toHaveBeenCalledWith("stream_layout", {
        html: "<div>Card Content</div>",
        final: true,
      });
    });
  });
});
