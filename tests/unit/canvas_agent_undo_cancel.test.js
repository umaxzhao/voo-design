import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runAgentTurn } from "../../src/canvas/agent/canvas_agent.js";

function createMockEditor() {
  const committedActions = [];
  let docContent = "initial";
  let batchDepth = 0;
  let isMuted = false;
  let muteCallback = null;

  const editor = {
    getDocument: vi.fn(() => ({ content: docContent })),
    getDoc: vi.fn(() => ({ content: docContent })),
    serialise: vi.fn(() => docContent),
    beginBatch: vi.fn(() => {
      batchDepth += 1;
    }),
    endBatch: vi.fn(() => {
      batchDepth = Math.max(0, batchDepth - 1);
    }),
    mute: vi.fn((fn) => {
      isMuted = true;
      muteCallback = fn;
      return fn();
    }),
    commit: vi.fn((message) => {
      committedActions.push(message);
    }),
    commitEditorDocument: vi.fn((options) => {
      committedActions.push(options?.message || "commit");
    }),
    updateNode: vi.fn((id, patch) => {
      docContent = `updated:${id}:${JSON.stringify(patch)}`;
    }),
    addRectAt: vi.fn(({ x, y }) => {
      const id = `rect_${Date.now()}`;
      docContent = `added:${id}`;
      return id;
    }),
    __test: {
      getCommittedActions: () => committedActions,
      getDocContent: () => docContent,
      getBatchDepth: () => batchDepth,
      getIsMuted: () => isMuted,
      setDocContent: (c) => { docContent = c; },
      clearCommittedActions: () => { committedActions.length = 0; },
    },
  };

  return editor;
}

function createStreamStep(toolCallsSequence) {
  let callIndex = 0;
  return async () => {
    const toolCalls = toolCallsSequence[callIndex] ?? [];
    callIndex += 1;
    return { text: "", toolCalls };
  };
}

describe("runAgentTurn undo grouping on cancel/fail", () => {
  let mockEditor;
  let originalWindow;

  beforeEach(() => {
    originalWindow = globalThis.window;
    globalThis.window = new EventTarget();
    mockEditor = createMockEditor();
    globalThis.window.__vooEditor = mockEditor;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("commits 'AI: Agent turn' on successful completion with mutations", async () => {
    const streamStep = createStreamStep([
      [{ id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) }],
      [],
    ]);

    await runAgentTurn({
      config: { apiKey: "test", baseUrl: "http://test", model: "test" },
      history: [],
      userText: "create a rectangle",
      tools: [],
      executeTool: async (name, args) => {
        mockEditor.addRectAt({ x: args.x, y: args.y });
        return { ok: true, layerId: "rect_1" };
      },
      streamStep,
    });

    expect(mockEditor.__test.getCommittedActions()).toContain("AI: Agent turn");
  });

  it("commits 'AI: Agent turn (cancelled)' when aborted mid-turn with mutations", async () => {
    const controller = new AbortController();
    let toolCallCount = 0;

    const streamStep = createStreamStep([
      [{ id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) }],
      [{ id: "call_2", name: "create_shape", arguments: JSON.stringify({ kind: "ellipse", x: 50, y: 50, width: 50, height: 50 }) }],
      [],
    ]);

    const executeTool = async (name, args) => {
      toolCallCount += 1;
      mockEditor.addRectAt({ x: args.x, y: args.y });
      if (toolCallCount === 1) {
        // Abort after first tool completes, before second tool call
        controller.abort();
      }
      return { ok: true, layerId: `layer_${args.kind}` };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create shapes",
        tools: [],
        executeTool,
        signal: controller.signal,
        streamStep,
      })
    ).rejects.toThrow();

    const committed = mockEditor.__test.getCommittedActions();
    expect(committed).toContain("AI: Agent turn (cancelled)");
    expect(committed.filter((c) => c.startsWith("AI: Agent turn"))).toHaveLength(1);
  });

  it("commits 'AI: Agent turn (cancelled)' when streamChatTurn throws AbortError", async () => {
    const controller = new AbortController();

    const streamStep = async () => {
      controller.abort();
      await new Promise((r) => setTimeout(r, 10));
      throw new DOMException("Aborted", "AbortError");
    };

    const executeTool = async (name, args) => {
      mockEditor.addRectAt({ x: args.x, y: args.y });
      return { ok: true, layerId: "layer_1" };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create shape",
        tools: [],
        executeTool,
        signal: controller.signal,
        streamStep,
      })
    ).rejects.toThrow();

    const committed = mockEditor.__test.getCommittedActions();
    // No mutations happened (streamStep threw before any tool calls), so no commit
    expect(committed.filter((c) => c.startsWith("AI: Agent turn"))).toHaveLength(0);
  });

  it("commits 'AI: Agent turn (cancelled)' when signal aborted before first step", async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    const streamStep = createStreamStep([
      [{ id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) }],
      [],
    ]);

    const executeTool = async (name, args) => {
      mockEditor.addRectAt({ x: args.x, y: args.y });
      return { ok: true, layerId: "rect_1" };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create shape",
        tools: [],
        executeTool,
        signal: controller.signal,
        streamStep,
      })
    ).rejects.toThrow();

    const committed = mockEditor.__test.getCommittedActions();
    // No mutations happened (aborted before first tool), so no commit
    expect(committed.filter((c) => c.startsWith("AI: Agent turn"))).toHaveLength(0);
  });

  it("does not commit empty history entry when nothing changed on cancel", async () => {
    const controller = new AbortController();

    const streamStep = async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    };

    const executeTool = async () => ({ ok: true });

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "do nothing",
        tools: [],
        executeTool,
        signal: controller.signal,
        streamStep,
      })
    ).rejects.toThrow();

    const committed = mockEditor.__test.getCommittedActions();
    expect(committed.filter((c) => c.startsWith("AI: Agent turn"))).toHaveLength(0);
  });

  it("does not commit empty history entry when only read-only tools used and cancelled", async () => {
    const controller = new AbortController();

    const streamStep = createStreamStep([
      [{ id: "call_1", name: "inspect_layer_tree", arguments: "{}" }],
      [],
    ]);

    const executeTool = async () => {
      controller.abort();
      return { ok: true };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "inspect",
        tools: [],
        executeTool,
        signal: controller.signal,
        streamStep,
      })
    ).rejects.toThrow();

    const committed = mockEditor.__test.getCommittedActions();
    expect(committed.filter((c) => c.startsWith("AI: Agent turn"))).toHaveLength(0);
  });

  it("restores batch state (endBatch called) even when cancelled", async () => {
    const controller = new AbortController();

    const streamStep = createStreamStep([
      [{ id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) }],
      [],
    ]);

    const executeTool = async (name, args) => {
      mockEditor.addRectAt({ x: args.x, y: args.y });
      controller.abort(); // Abort after first tool
      return { ok: true, layerId: "rect_1" };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create rectangle",
        tools: [],
        executeTool,
        signal: controller.signal,
        streamStep,
      })
    ).rejects.toThrow();

    expect(mockEditor.__test.getBatchDepth()).toBe(0);
  });

  it("restores batch state (endBatch called) even when streamStep fails", async () => {
    const streamStep = async () => {
      throw new Error("Network error");
    };

    const executeTool = async (name, args) => {
      mockEditor.addRectAt({ x: args.x, y: args.y });
      return { ok: true, layerId: "rect_1" };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create rectangle",
        tools: [],
        executeTool,
        streamStep,
      })
    ).rejects.toThrow("Network error");

    expect(mockEditor.__test.getBatchDepth()).toBe(0);
  });

  it("restores suppressed commits even when cancelled", async () => {
    const controller = new AbortController();

    const editor = {
      getDocument: vi.fn(() => ({ content: "initial" })),
      getDoc: vi.fn(() => ({ content: "initial" })),
      serialise: vi.fn(() => "initial"),
      commitEditorDocument: vi.fn((options) => {}),
      commit: vi.fn((message) => {}),
      updateNode: vi.fn((id, patch) => {}),
      addRectAt: vi.fn(({ x, y }) => "rect_1"),
    };
    globalThis.window.__vooEditor = editor;

    const streamStep = createStreamStep([
      [{ id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) }],
      [],
    ]);

    const executeTool = async (name, args) => {
      controller.abort();
      return { ok: true, layerId: "rect_1" };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create rectangle",
        tools: [],
        executeTool,
        signal: controller.signal,
        streamStep,
      })
    ).rejects.toThrow();

    expect(editor.commit).toHaveBeenCalledWith("AI: Agent turn (cancelled)");
  });

  it("restores suppressed commits even when streamStep fails after mutations", async () => {
    const editor = {
      getDocument: vi.fn(() => ({ content: "initial" })),
      getDoc: vi.fn(() => ({ content: "initial" })),
      serialise: vi.fn(() => "initial"),
      commitEditorDocument: vi.fn((options) => {}),
      commit: vi.fn((message) => {}),
      updateNode: vi.fn((id, patch) => {}),
      addRectAt: vi.fn(({ x, y }) => "rect_1"),
    };
    globalThis.window.__vooEditor = editor;

    let callCount = 0;
    const streamStep = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          text: "",
          toolCalls: [{ id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) }],
        };
      }
      throw new Error("Network error");
    };

    const executeTool = async (name, args) => {
      return { ok: true, layerId: "rect_1" };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create rectangle",
        tools: [],
        executeTool,
        streamStep,
      })
    ).rejects.toThrow("Network error");

    expect(editor.commit).toHaveBeenCalledWith("AI: Agent turn (failed)");
  });

  it("restores mute state even when cancelled", async () => {
    const controller = new AbortController();

    const editor = {
      getDocument: vi.fn(() => ({ content: "initial" })),
      getDoc: vi.fn(() => ({ content: "initial" })),
      serialise: vi.fn(() => "initial"),
      mute: vi.fn((fn) => fn()),
      commit: vi.fn((message) => {}),
      updateNode: vi.fn((id, patch) => {}),
      addRectAt: vi.fn(({ x, y }) => "rect_1"),
    };
    globalThis.window.__vooEditor = editor;

    const streamStep = createStreamStep([
      [{ id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) }],
      [],
    ]);

    const executeTool = async (name, args) => {
      controller.abort();
      return { ok: true, layerId: "rect_1" };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create rectangle",
        tools: [],
        executeTool,
        signal: controller.signal,
        streamStep,
      })
    ).rejects.toThrow();

    expect(editor.mute).toHaveBeenCalled();
    expect(editor.commit).toHaveBeenCalledWith("AI: Agent turn (cancelled)");
  });

  it("commits exactly one entry when multiple mutations then cancel", async () => {
    const controller = new AbortController();
    let toolCallCount = 0;

    const streamStep = createStreamStep([
      [
        { id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) },
        { id: "call_2", name: "create_shape", arguments: JSON.stringify({ kind: "ellipse", x: 50, y: 50, width: 50, height: 50 }) },
      ],
      [],
    ]);

    const executeTool = async (name, args) => {
      toolCallCount += 1;
      mockEditor.addRectAt({ x: args.x, y: args.y });
      if (toolCallCount === 2) {
        controller.abort(); // Abort after second tool
      }
      return { ok: true, layerId: `layer_${args.kind}` };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create shapes",
        tools: [],
        executeTool,
        signal: controller.signal,
        streamStep,
      })
    ).rejects.toThrow();

    const committed = mockEditor.__test.getCommittedActions();
    const agentTurnCommits = committed.filter((c) => c.startsWith("AI: Agent turn"));
    expect(agentTurnCommits).toHaveLength(1);
    expect(agentTurnCommits[0]).toBe("AI: Agent turn (cancelled)");
  });

  it("continues turn when executeTool throws (tool error reported to model)", async () => {
    const streamStep = createStreamStep([
      [
        { id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) },
        { id: "call_2", name: "create_shape", arguments: JSON.stringify({ kind: "ellipse", x: 50, y: 50, width: 50, height: 50 }) },
      ],
      [],
    ]);

    let callCount = 0;
    const executeTool = async (name, args) => {
      callCount += 1;
      mockEditor.addRectAt({ x: args.x, y: args.y });
      if (callCount === 1) {
        throw new Error("Tool execution failed");
      }
      return { ok: true, layerId: `layer_${args.kind}` };
    };

    // Turn should succeed (tool error caught and reported, turn continues)
    const result = await runAgentTurn({
      config: { apiKey: "test", baseUrl: "http://test", model: "test" },
      history: [],
      userText: "create shapes",
      tools: [],
      executeTool,
      streamStep,
    });

    expect(result).toBe("");
    const committed = mockEditor.__test.getCommittedActions();
    expect(committed).toContain("AI: Agent turn");
    expect(committed.filter((c) => c.startsWith("AI: Agent turn"))).toHaveLength(1);
  });

  it("commits 'AI: Agent turn (failed)' when streamStep throws non-AbortError", async () => {
    const streamStep = async () => {
      throw new Error("Network error");
    };

    const executeTool = async (name, args) => {
      mockEditor.addRectAt({ x: args.x, y: args.y });
      return { ok: true, layerId: "layer_1" };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create shape",
        tools: [],
        executeTool,
        streamStep,
      })
    ).rejects.toThrow("Network error");

    const committed = mockEditor.__test.getCommittedActions();
    // No mutations happened (streamStep threw before any tool calls), so no commit
    expect(committed.filter((c) => c.startsWith("AI: Agent turn"))).toHaveLength(0);
  });

  it("commits 'AI: Agent turn (failed)' when streamStep throws after mutations", async () => {
    let callCount = 0;
    const streamStep = async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          text: "",
          toolCalls: [{ id: "call_1", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 100 }) }],
        };
      }
      throw new Error("Network error");
    };

    const executeTool = async (name, args) => {
      mockEditor.addRectAt({ x: args.x, y: args.y });
      return { ok: true, layerId: "rect_1" };
    };

    await expect(
      runAgentTurn({
        config: { apiKey: "test", baseUrl: "http://test", model: "test" },
        history: [],
        userText: "create shape",
        tools: [],
        executeTool,
        streamStep,
      })
    ).rejects.toThrow("Network error");

    const committed = mockEditor.__test.getCommittedActions();
    expect(committed).toContain("AI: Agent turn (failed)");
    expect(committed.filter((c) => c.startsWith("AI: Agent turn"))).toHaveLength(1);
  });
});
it("marks an interrupted tool cancelled, closes the batch, and skips queued calls", async () => {
  const previous = globalThis.window;
  const editor = createMockEditor();
  globalThis.window = { __vooEditor: editor };
  const controller = new AbortController();
  const events = [];
  const executeTool = vi.fn(() => new Promise(() => {}));
  try {
    const pending = runAgentTurn({ history: [], userText: "draw", tools: [],
      signal: controller.signal, executeTool, onToolEvent: event => events.push(event),
      streamStep: async () => ({ text: "", toolCalls: [
        { id: "first", name: "create_shape", arguments: "{}" },
        { id: "second", name: "create_shape", arguments: "{}" },
      ] }),
    });
    await vi.waitFor(() => expect(executeTool).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(events.map(event => event.status)).toEqual(["in_progress", "cancelled"]);
    expect(executeTool).toHaveBeenCalledOnce();
    expect(editor.__test.getBatchDepth()).toBe(0);
  } finally { globalThis.window = previous; }
});
