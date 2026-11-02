import { beforeEach, describe, expect, it } from "vitest";
import {
  CODEX_REASONING_STORAGE_KEY,
  getCodexReasoningSettings,
  setStoredCodexReasoningEffort,
} from "../../src/shared/codex-reasoning.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";

const model = {
  id: "codex:gpt-6-astra",
  supportedReasoningEfforts: ["minimal", "low", "medium", "high"],
  defaultReasoningEffort: "medium",
};

describe("Codex reasoning preferences", () => {
  beforeEach(() => {
    setSetting(CODEX_REASONING_STORAGE_KEY, null);
  });

  it("uses automatic mode until the user chooses a supported effort", () => {
    expect(getCodexReasoningSettings(model.id, [model])).toEqual({
      reasoningEfforts: model.supportedReasoningEfforts,
      reasoningEffort: null,
    });
  });

  it("stores an effort per model and clears it for automatic mode", async () => {
    await setStoredCodexReasoningEffort(model.id, "high");
    expect(getCodexReasoningSettings(model.id, [model]).reasoningEffort).toBe("high");

    await setStoredCodexReasoningEffort(model.id, null);
    expect(getSetting(CODEX_REASONING_STORAGE_KEY)).toEqual({});
    expect(getCodexReasoningSettings(model.id, [model]).reasoningEffort).toBeNull();
  });

  it("ignores a saved effort when the selected model no longer supports it", async () => {
    await setStoredCodexReasoningEffort(model.id, "high");
    const refreshedModel = { ...model, supportedReasoningEfforts: ["low", "medium"] };
    expect(getCodexReasoningSettings(model.id, [refreshedModel]).reasoningEffort).toBeNull();
  });
});
