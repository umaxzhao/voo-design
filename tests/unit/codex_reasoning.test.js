import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_REASONING_STORAGE_KEY,
  getCodexReasoningSettings,
  setStoredCodexReasoningEffort,
} from "../../src/shared/codex-reasoning.js";

describe("Codex reasoning preference", () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    });
  });

  it("keeps Default implicit and resolves prefixed model metadata", async () => {
    const models = [{ id: "codex:gpt-6-astra", supportedReasoningEfforts: ["low", "high"] }];
    expect(getCodexReasoningSettings("codex:gpt-6-astra", models)).toEqual({
      reasoningEfforts: ["low", "high"],
      reasoningEffort: null,
    });
    await setStoredCodexReasoningEffort("codex:gpt-6-astra", "high");
    expect(getCodexReasoningSettings("gpt-6-astra", models).reasoningEffort).toBe("high");
    expect(localStorage.getItem(CODEX_REASONING_STORAGE_KEY)).toContain('"high"');
    await setStoredCodexReasoningEffort("gpt-6-astra", null);
    expect(getCodexReasoningSettings("codex:gpt-6-astra", models).reasoningEffort).toBeNull();
  });

  it("ignores a saved effort no longer advertised by the model", async () => {
    await setStoredCodexReasoningEffort("gpt-6-astra", "ultra");
    expect(getCodexReasoningSettings("codex:gpt-6-astra", [
      { id: "gpt-6-astra", supportedReasoningEfforts: ["low"] },
    ]).reasoningEffort).toBeNull();
  });
});
