import { t } from "../shared/i18n.js";

/** Preserve manual edits while making Agent panel feedback part of both prompts. */
export async function appendVideoShotFeedback(store, shotNodes, feedback) {
  const direction = t("nodeStore.videoScript.feedbackLine", { feedback });
  const updates = [shotNodes.shotStill, shotNodes.shotMotion].map((nodeId) => {
    const node = store.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(t("nodeStore.videoScript.promptMissing"));
    return {
      nodeId,
      data: {
        text: `${String(node.data.text ?? "").trimEnd()}\n${direction}`.trim(),
      },
    };
  });
  await store.batchUpdateNodes(updates);
}
