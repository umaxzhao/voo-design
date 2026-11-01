import { useState } from "react";
import {
  getCodexReasoningSettings,
  setStoredCodexReasoningEffort,
} from "../../../shared/codex-reasoning.js";

/** Resolve current Codex capabilities and keep the selected effort in sync. */
export function useReasoningEffort(model, modelGroups) {
  const [selection, setSelection] = useState({ model: null, effort: null });
  const codexModels = modelGroups.find((group) => group.cliId === "codex")?.models ?? [];
  const { reasoningEfforts, reasoningEffort: storedEffort } =
    getCodexReasoningSettings(model, codexModels);
  const reasoningEffort = selection.model === model ? selection.effort : storedEffort;
  const selectReasoningEffort = async (effort) => {
    await setStoredCodexReasoningEffort(model, effort);
    setSelection({ model, effort });
  };
  return { reasoningEfforts, reasoningEffort, selectReasoningEffort };
}
