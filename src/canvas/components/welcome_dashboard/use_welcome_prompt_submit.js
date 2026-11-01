import { useDesignStore } from "../../../store/design_store.js";
import { AI_GEN_TYPES } from "./welcome_constants.js";

export function useWelcomePromptSubmit({
  promptText,
  setPromptText,
  activePill,
  attachments,
  references,
  submitting,
  setSubmitting,
  setConfigNotice,
  styleId,
  designSystemId,
  modelId,
  size,
  candidates,
  locale,
  t,
  openAgentSettings,
  handleCreateNew,
}) {
  const handlePromptSubmit = async (event) => {
    event?.preventDefault();
    if (submitting || references.isReading) return;
    const activePreset =
      AI_GEN_TYPES.find((item) => item.id === activePill) || AI_GEN_TYPES[0];
    const userPrompt =
      promptText.trim() ||
      (attachments.some((item) => item.kind === "image")
        ? t("welcome.prompt.recreatePrompt")
        : "");
    const docLabel = userPrompt
      ? userPrompt.slice(0, 24)
      : t(activePreset.label);

    setSubmitting(true);
    setConfigNotice("");
    try {
      const { buildGenerationIntent } = userPrompt
        ? await import("./generation_intent.js")
        : {};
      const intent = userPrompt
        ? buildGenerationIntent({
            preset: activePreset,
            prompt: userPrompt,
            styleId,
            designSystemId,
            modelId,
            size,
            attachments,
            candidates,
            locale,
            t,
          })
        : null;
      if (intent) {
        try {
          const { resolveAgentProvider } = await import(
            "../../agent/agent_provider.js"
          );
          await resolveAgentProvider(intent.modelId);
        } catch {
          setConfigNotice(t("welcome.prompt.configNeeded"));
          openAgentSettings();
          return;
        }
      }
      await handleCreateNew({
        label: docLabel,
        width: size?.width ?? activePreset.width,
        height: size?.height ?? activePreset.height,
        type: activePreset.type,
        category: activePreset.category,
      });
      if (intent) {
        useDesignStore.getState().setPendingGeneration(intent);
        setPromptText("");
        references.clearAttachments();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return { handlePromptSubmit };
}
