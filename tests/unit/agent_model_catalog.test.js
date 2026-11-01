import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCodexModelCatalog } from "../../electron/codex_model_catalog.js";
import { antigravityModelStatus } from "../../electron/antigravity_models.js";

beforeEach(() => vi.resetModules());
afterEach(() => vi.useRealTimers());

describe("agent model catalog", () => {
  it("shares one current version per model family", async () => {
    const { availableModelGroups } = await import(
      "../../src/canvas/components/agent-panel/model_catalog.js"
    );
    const [claude, codex] = availableModelGroups([]);
    expect(claude.models.map((model) => model.id)).toEqual(
      expect.arrayContaining([
        "claude:claude-opus-5-5",
        "claude:claude-sonnet-5-5",
        "claude:claude-haiku-5-5",
        "claude:claude-fable-5-1",
      ]),
    );
    expect(claude.models.map((model) => model.id)).not.toEqual(
      expect.arrayContaining(["claude:sonnet", "claude:claude-opus-4-6"]),
    );
    expect(codex.models.map((model) => model.id)).toEqual(
      expect.arrayContaining([
        "codex:gpt-6.1-sol",
        "codex:gpt-6.1-terra",
        "codex:gpt-6-astra",
      ]),
    );
    expect(codex.models.map((model) => model.id)).not.toEqual(
      expect.arrayContaining(["codex:gpt-5.6-sol", "codex:gpt-6-sol"]),
    );
  });

  it("filters old discovered versions while keeping current reasoning tiers", async () => {
    const { refreshModelCatalog } = await import(
      "../../src/canvas/components/agent-panel/model_discovery.js"
    );
    const { availableModelGroups } = await import(
      "../../src/canvas/components/agent-panel/model_catalog.js"
    );
    await refreshModelCatalog({
      connect: async () => ({
        models: [
          { id: "gpt-6-sol", label: "GPT-6 Sol" },
          {
            id: "gpt-6.1-sol",
            label: "GPT-6.1 Sol",
            supportedReasoningEfforts: ["minimal", "low", "medium", "high"],
            defaultReasoningEffort: "medium",
          },
          { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
          { id: "gpt-6.1-terra", label: "GPT-6.1 Terra" },
        ],
      }),
      checkStatus: async () => ({
        models: [
          { id: "gemini-3.7-flash-high", label: "Gemini 3.7 Flash (High)" },
          { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
          { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
          { id: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet" },
          { id: "claude-sonnet-5-5-high", label: "Claude Sonnet 5.5 (High)" },
        ],
      }),
    });
    const [claude, codex, antigravity] = availableModelGroups([]);
    expect(codex.models.map(({ id }) => id)).toEqual([
      "codex:gpt-6.1-sol",
      "codex:gpt-6.1-terra",
    ]);
    expect(codex.models[0]).toMatchObject({
      supportedReasoningEfforts: ["minimal", "low", "medium", "high"],
      defaultReasoningEffort: "medium",
    });
    expect(antigravity.models.map(({ id }) => id)).toEqual([
      "antigravity:gemini-3.8-flash-high",
      "antigravity:gemini-3.8-flash-medium",
      "antigravity:claude-sonnet-5-5-high",
    ]);
    expect(claude.models.map(({ id }) => id)).toContain("claude:claude-opus-5-5");
  });

  it("publishes discovered models to both consumers without changing settings", async () => {
    const { refreshModelCatalog, subscribeModelCatalog } = await import(
      "../../src/canvas/components/agent-panel/model_discovery.js"
    );
    const { availableModelGroups } = await import(
      "../../src/canvas/components/agent-panel/model_catalog.js"
    );
    const { setSetting, getSetting } = await import(
      "../../src/shared/settings.js"
    );
    setSetting("agent.model", "codex:gpt-6-astra");
    const listeners = [vi.fn(), vi.fn()];
    const unsubscribe = listeners.map(subscribeModelCatalog);
    const bridge = {
      connect: vi.fn(async () => ({
        models: [
          { id: "next-model", label: "Next model" },
          { id: "next-model", label: "Next model" },
          { id: "hidden-model", hidden: true },
          { id: "claude/next-model", label: "Routed model" },
        ],
      })),
      checkStatus: vi.fn(async () => ({
        models: [{ id: "next-gemini", label: "Next Gemini" }],
      })),
    };
    await Promise.all([
      refreshModelCatalog(bridge),
      refreshModelCatalog(bridge),
    ]);
    expect(bridge.connect).toHaveBeenCalledTimes(1);
    expect(bridge.checkStatus).toHaveBeenCalledWith("antigravity", {
      includeModels: true,
    });
    const custom = { cliId: "api", models: [{ id: "api:custom" }] };
    const groups = availableModelGroups([custom]);
    expect(groups[1].models).toEqual([
      { id: "codex:next-model", label: "Next model" },
      { id: "codex:claude/next-model", label: "Routed model" },
    ]);
    expect(groups[2].models[0].id).toBe("antigravity:next-gemini");
    expect(groups.at(-1)).toBe(custom);
    expect(getSetting("agent.model")).toBe("codex:gpt-6-astra");
    for (const listener of listeners) expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe.forEach((stop) => stop());
  });

  it("retains the last list after failure and retries on cache expiry", async () => {
    vi.useFakeTimers();
    const { refreshModelCatalog, getDiscoveredModels } = await import(
      "../../src/canvas/components/agent-panel/model_discovery.js"
    );
    const bridge = {
      connect: vi
        .fn()
        .mockResolvedValueOnce({ models: [{ id: "first" }] })
        .mockRejectedValueOnce(new Error("private provider diagnostics"))
        .mockResolvedValueOnce({ models: [{ id: "second" }] }),
    };
    await refreshModelCatalog(bridge);
    vi.advanceTimersByTime(300001);
    expect(await refreshModelCatalog(bridge)).toEqual([
      { cliId: "codex", error: "cli.modelCapabilitiesUnavailable" },
    ]);
    expect(getDiscoveredModels("codex")[0].id).toBe("codex:first");
    vi.advanceTimersByTime(300001);
    await refreshModelCatalog(bridge);
    expect(getDiscoveredModels("codex")[0].id).toBe("codex:second");
  });

  it("does not overwrite fallback models for unsupported or malformed discovery", async () => {
    const { refreshModelCatalog, getDiscoveredModels } = await import(
      "../../src/canvas/components/agent-panel/model_discovery.js"
    );
    expect(await refreshModelCatalog(null)).toEqual([]);
    expect(
      await refreshModelCatalog({
        connect: async () => ({ installed: false }),
      }),
    ).toEqual([]);
    await refreshModelCatalog({
      connect: async () => ({ models: [{ id: 123 }] }),
    });
    expect(getDiscoveredModels("codex")).toBeUndefined();
  });
});

describe("native model discovery", () => {
  it("keeps display/visibility metadata, paginates, and refreshes capabilities", async () => {
    vi.useFakeTimers();
    const model = (id, hidden = false) => ({
      model: id,
      displayName: `Label ${id}`,
      hidden,
      supportedReasoningEfforts: [{ reasoningEffort: "high" }],
      defaultReasoningEffort: "high",
    });
    const connection = {
      call: vi
        .fn()
        .mockResolvedValueOnce({ data: [model("first")], nextCursor: "next" })
        .mockResolvedValueOnce({ data: [model("hidden", true)] })
        .mockResolvedValueOnce({ data: [model("updated")] }),
    };
    const getModels = createCodexModelCatalog(connection);
    const [models, cached] = await Promise.all([getModels(), getModels()]);
    expect(models).toBe(cached);
    expect(models[1]).toMatchObject({
      id: "hidden",
      hidden: true,
      label: "Label hidden",
    });
    expect(connection.call).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(300001);
    expect((await getModels())[0].id).toBe("updated");
  });

  it("retries native metadata failure without leaking diagnostics", async () => {
    const connection = {
      call: vi
        .fn()
        .mockRejectedValueOnce(new Error("private details"))
        .mockResolvedValueOnce({ data: [] }),
    };
    const getModels = createCodexModelCatalog(connection);
    await expect(getModels()).rejects.toThrow(
      "cli.modelCapabilitiesUnavailable",
    );
    expect(await getModels()).toEqual([]);
    expect(
      await antigravityModelStatus("agy", async () => {
        throw new Error("private details");
      }),
    ).toEqual({ modelsError: "cli.modelCapabilitiesUnavailable" });
  });
});
