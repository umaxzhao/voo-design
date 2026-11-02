const mockStorage = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

if (typeof globalThis.window === "undefined") globalThis.window = new EventTarget();
globalThis.window.localStorage = mockStorage;

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runAgentTurn } from "../../src/canvas/agent/canvas_agent.js";
import { sanitizeMessagesForModel, streamChatTurn } from "../../src/canvas/agent/chat_stream.js";
import { useWelcomePromptSubmit } from "../../src/canvas/components/welcome_dashboard/use_welcome_prompt_submit.js";
import { useDesignStore } from "../../src/store/design_store.js";
import { workspaceStorage } from "../../src/services/workspace_storage.js";
import { getRecentFiles, addRecentFile } from "../../src/canvas/store/recent_files.js";

describe("agent_vision_and_empty_project", () => {
  beforeEach(() => { vi.restoreAllMocks(); mockStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); mockStorage.clear(); });

  describe("a) non-vision models do not receive image_url blocks in messages", () => {
    it("does not attach image_url in userContent for non-vision models like deepseek-chat", async () => {
      const messagesSeen = [];
      const streamStep = vi.fn(async ({ messages }) => {
        messagesSeen.push(JSON.parse(JSON.stringify(messages)));
        return { text: "done", toolCalls: [] };
      });
      await runAgentTurn({
        config: { apiKey: "test-key", baseUrl: "https://api.test.com", model: "deepseek-chat" },
        history: [], userText: "create a banner", tools: [],
        visualReferences: [{ name: "sample.png", dataUrl: "data:image/png;base64,TEST_DATA" }],
        streamStep,
      });

      expect(messagesSeen.length).toBeGreaterThan(0);
      const hasImageUrl = messagesSeen[0].some((msg) =>
        Array.isArray(msg.content) && msg.content.some((item) => item?.type === "image_url" || item?.image_url),
      );
      expect(hasImageUrl).toBe(false);
      const userMsg = messagesSeen[0].find((m) => m.role === "user");
      expect(typeof userMsg.content).toBe("string");
      expect(userMsg.content).toContain("create a banner");
    });

    it("attaches image_url in userContent for vision models like gpt-4o", async () => {
      const messagesSeen = [];
      const streamStep = vi.fn(async ({ messages }) => {
        messagesSeen.push(JSON.parse(JSON.stringify(messages)));
        return { text: "done", toolCalls: [] };
      });
      await runAgentTurn({
        config: { apiKey: "test-key", baseUrl: "https://api.test.com", model: "gpt-4o" },
        history: [], userText: "create a banner", tools: [],
        visualReferences: [{ name: "sample.png", dataUrl: "data:image/png;base64,TEST_DATA" }],
        streamStep,
      });

      expect(messagesSeen.length).toBeGreaterThan(0);
      const userMsg = messagesSeen[0].find((m) => m.role === "user");
      expect(Array.isArray(userMsg.content)).toBe(true);
      const imageNode = userMsg.content.find((item) => item?.type === "image_url");
      expect(imageNode).toBeDefined();
      expect(imageNode.image_url.url).toBe("data:image/png;base64,TEST_DATA");
    });

    it("capture_canvas pushes text-only notice for non-vision model and no image_url", async () => {
      const messagesSeen = [];
      const streamStep = vi.fn(async ({ messages }) => {
        messagesSeen.push(JSON.parse(JSON.stringify(messages)));
        if (streamStep.mock.calls.length === 1) {
          return { text: "capturing canvas", toolCalls: [{ id: "call_capture", name: "capture_canvas", arguments: "{}" }] };
        }
        return { text: "reviewed", toolCalls: [] };
      });
      await runAgentTurn({
        config: { apiKey: "test-key", baseUrl: "https://api.test.com", model: "deepseek-chat" },
        history: [], userText: "verify canvas", tools: [],
        executeTool: vi.fn(async () => ({ ok: true, dataUrl: "data:image/png;base64,CAPTURED_CANVAS", width: 800, height: 600 })),
        streamStep,
      });

      expect(messagesSeen.length).toBe(2);
      const hasImageUrl = messagesSeen[1].some((msg) =>
        Array.isArray(msg.content) && msg.content.some((item) => item?.type === "image_url" || item?.image_url),
      );
      expect(hasImageUrl).toBe(false);
      const feedbackMsg = messagesSeen[1].at(-1);
      expect(feedbackMsg.role).toBe("user");
      expect(feedbackMsg.content).toBe("Canvas captured. Review the lint summary above.");
    });

    it("capture_canvas pushes image_url for vision model", async () => {
      const messagesSeen = [];
      const streamStep = vi.fn(async ({ messages }) => {
        messagesSeen.push(JSON.parse(JSON.stringify(messages)));
        if (streamStep.mock.calls.length === 1) {
          return { text: "capturing canvas", toolCalls: [{ id: "call_capture", name: "capture_canvas", arguments: "{}" }] };
        }
        return { text: "reviewed", toolCalls: [] };
      });
      await runAgentTurn({
        config: { apiKey: "test-key", baseUrl: "https://api.test.com", model: "gpt-4o" },
        history: [], userText: "verify canvas", tools: [],
        executeTool: vi.fn(async () => ({ ok: true, dataUrl: "data:image/png;base64,CAPTURED_CANVAS", width: 800, height: 600 })),
        streamStep,
      });

      expect(messagesSeen.length).toBe(2);
      const feedbackMsg = messagesSeen[1].at(-1);
      expect(feedbackMsg.role).toBe("user");
      expect(Array.isArray(feedbackMsg.content)).toBe(true);
      const imageNode = feedbackMsg.content.find((item) => item?.type === "image_url");
      expect(imageNode?.image_url?.url).toBe("data:image/png;base64,CAPTURED_CANVAS");
    });
  });

  describe("b) sanitizeMessagesForModel filters multimodal messages for non-vision models", () => {
    it("converts image_url blocks to text for deepseek-chat", () => {
      const input = [
        { role: "system", content: "You are an assistant." },
        {
          role: "user",
          content: [
            { type: "text", text: "Please inspect this screenshot:" },
            { type: "image_url", image_url: { url: "data:image/png;base64,ABC" } },
          ],
        },
        { role: "assistant", content: "I am ready." },
      ];
      const result = sanitizeMessagesForModel(input, "deepseek-chat");
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(input[0]);
      expect(result[1].content).toEqual([
        { type: "text", text: "Please inspect this screenshot:" },
        { type: "text", text: "[image attached]" },
      ]);
      expect(result[2]).toEqual(input[2]);
    });

    it("converts image_url blocks to text for qwen-text", () => {
      const input = [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,123" } }] }];
      const result = sanitizeMessagesForModel(input, "qwen-text");
      expect(result[0].content).toEqual([{ type: "text", text: "[image attached]" }]);
    });

    it("leaves messages unchanged for vision model claude-3-5-sonnet", () => {
      const input = [{ role: "user", content: [{ type: "text", text: "Look here" }, { type: "image_url", image_url: { url: "data:image/png;base64,ABC" } }] }];
      expect(sanitizeMessagesForModel(input, "claude-3-5-sonnet-20241022")).toBe(input);
    });

    it("handles string content and non-array messages safely", () => {
      const input = [{ role: "user", content: "simple text" }, null, { role: "assistant" }];
      const result = sanitizeMessagesForModel(input, "deepseek-chat");
      expect(result[0].content).toBe("simple text");
      expect(result[1]).toBeNull();
      expect(result[2].role).toBe("assistant");
    });

    it("streamChatTurn reports descriptive error on fetch network failure", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
      await expect(
        streamChatTurn({
          config: { apiKey: "k", baseUrl: "https://api.example.com", model: "deepseek-chat" },
          messages: [], tools: [],
        }),
      ).rejects.toThrow(/Network error calling deepseek-chat at https:\/\/api\.example\.com: Failed to fetch/);
    });

    it("streamChatTurn includes response body on HTTP error status", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: false, status: 400, body: {},
        text: async () => JSON.stringify({ error: { message: "Model does not support vision" } }),
      })));
      await expect(
        streamChatTurn({
          config: { apiKey: "k", baseUrl: "https://api.example.com", model: "deepseek-chat" },
          messages: [], tools: [],
        }),
      ).rejects.toThrow(/agentHttpError: 400 - {"error":{"message":"Model does not support vision"}}/);
    });
  });

  describe("c) generation submit flow does not eagerly create empty project on disk", () => {
    it("does not call handleCreateNew when intent is present, sets pendingGeneration and memory project", async () => {
      const handleCreateNew = vi.fn();
      const setPromptText = vi.fn(), setSubmitting = vi.fn(), setConfigNotice = vi.fn();
      const references = { isReading: false, clearAttachments: vi.fn() };

      const { handlePromptSubmit } = useWelcomePromptSubmit({
        promptText: "Design a coffee shop landing page",
        setPromptText, activePill: "landing", attachments: [], references,
        submitting: false, setSubmitting, setConfigNotice,
        styleId: "auto", designSystemId: "auto", modelId: "gpt-4o",
        size: { width: 1440, height: 900 }, candidates: 1, locale: "zh",
        t: (k) => k, openAgentSettings: vi.fn(), handleCreateNew,
      });

      await handlePromptSubmit();
      expect(handleCreateNew).not.toHaveBeenCalled();

      const state = useDesignStore.getState();
      expect(state.pendingGeneration).toBeTruthy();
      expect(state.pendingGeneration.prompt).toContain("coffee shop");
      expect(state.pendingGeneration.kind).toBe("landing");
      state.clearPendingGeneration();
    });

    it("calls handleCreateNew when no user prompt is provided", async () => {
      const handleCreateNew = vi.fn();
      const references = { isReading: false, clearAttachments: vi.fn() };

      const { handlePromptSubmit } = useWelcomePromptSubmit({
        promptText: "", setPromptText: vi.fn(), activePill: "landing", attachments: [],
        references, submitting: false, setSubmitting: vi.fn(), setConfigNotice: vi.fn(),
        styleId: "auto", designSystemId: "auto", modelId: "gpt-4o",
        size: { width: 1440, height: 900 }, candidates: 1, locale: "zh",
        t: (k) => k, openAgentSettings: vi.fn(), handleCreateNew,
      });

      await handlePromptSubmit();
      expect(handleCreateNew).toHaveBeenCalledTimes(1);
      expect(useDesignStore.getState().pendingGeneration).toBeNull();
    });

    it("persists generated project to workspace only after layers are created", async () => {
      const writeFileSpy = vi.spyOn(workspaceStorage, "writeFileBytes").mockResolvedValue({
        name: "CoffeeLanding.voo", path: "/workspace/CoffeeLanding.voo",
      });

      const store = useDesignStore.getState();
      store.newVooProject({ label: "CoffeeLanding" });
      const pageId = store.editingNodeId;
      const docWithLayers = {
        version: 2, canvasId: pageId, width: 1440, height: 900,
        nodes: [
          { id: "frame-1", name: "Frame", isFrame: true },
          { id: "hero-text", name: "Heading", kind: "text", parentId: "frame-1" },
        ],
      };
      globalThis.window.__vooEditor = {
        getDocument: () => docWithLayers, getDoc: () => docWithLayers,
        serialise: () => docWithLayers, exportPng: () => "data:image/png;base64,PREVIEW",
      };

      const { buildProjectVooFile } = await import("../../src/canvas/store/project_io.js");
      const { encodeVooBinary } = await import("../../src/canvas/store/voo_binary.js");

      const enginesMap = new Map();
      enginesMap.set(pageId, { engine: globalThis.window.__vooEditor, ready: true });
      const { vooFile, primaryPreview } = await buildProjectVooFile({
        store, enginesRef: { current: enginesMap },
      });
      const bytes = encodeVooBinary(vooFile);
      const saved = await workspaceStorage.writeFileBytes("CoffeeLanding.voo", bytes, { category: "web" });

      expect(writeFileSpy).toHaveBeenCalledWith("CoffeeLanding.voo", expect.any(Uint8Array), { category: "web" });
      expect(bytes.length).toBeGreaterThan(218);

      store.setFilePath(saved.path);
      store.setFileName(saved.name);
      addRecentFile({
        name: saved.name, path: saved.path, category: "web", preview: primaryPreview, isDraft: false,
      });

      const recents = getRecentFiles();
      const recent = recents.find((r) => r.name === "CoffeeLanding.voo");
      expect(recent).toBeDefined();
      expect(recent.isDraft).toBe(false);
      expect(recent.path).toBe("/workspace/CoffeeLanding.voo");

      delete globalThis.window.__vooEditor;
      writeFileSpy.mockRestore();
    });

    it("leaves no file on disk if generation is cancelled or fails", async () => {
      const writeFileSpy = vi.spyOn(workspaceStorage, "writeFileBytes");
      const handleCreateNew = vi.fn();
      const { handlePromptSubmit } = useWelcomePromptSubmit({
        promptText: "Design something that gets cancelled",
        setPromptText: vi.fn(), activePill: "web", attachments: [],
        references: { isReading: false, clearAttachments: vi.fn() },
        submitting: false, setSubmitting: vi.fn(), setConfigNotice: vi.fn(),
        styleId: "auto", designSystemId: "auto", modelId: "deepseek-chat",
        size: { width: 1440, height: 900 }, candidates: 1, locale: "zh",
        t: (k) => k, openAgentSettings: vi.fn(), handleCreateNew,
      });

      await handlePromptSubmit();
      expect(writeFileSpy).not.toHaveBeenCalled();
      expect(useDesignStore.getState().filePath).toBeNull();
      useDesignStore.getState().clearPendingGeneration();
      writeFileSpy.mockRestore();
    });
  });
});
