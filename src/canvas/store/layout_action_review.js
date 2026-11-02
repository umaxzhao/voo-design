// Critique a valid editable layout and retain only a verified improvement.
import { streamLayoutText } from "./layout_action_helpers.js";
import { designSystemColorViolation } from "../design_systems.js";
import { extractLayoutMarkup } from "./layout-output.js";
import { LAYOUT_EVENT, emitAgentPanelEvent } from "./agent_panel_bus.js";
import {
  parseCritique,
  buildCritiquePrompt,
  buildImprovePrompt,
  reviewNeedsImprovement,
} from "../layout_critique.js";

async function critique({ html, brief, content, model }) {
  const text = await streamLayoutText({
    model,
    prompt: buildCritiquePrompt({ brief, html, content }),
  });
  return parseCritique(text);
}

function reportReview(nodeId, review) {
  if (!review) return;
  emitAgentPanelEvent(LAYOUT_EVENT.CRITIQUE, {
    nodeId,
    score: review.score,
    issues: review.issues,
    review,
  });
}

/** A failed review or improvement leaves the first valid draft intact. */
export async function reviewGeneratedLayout({
  html,
  brief,
  content,
  model,
  nodeId,
  width,
  height,
  designSystem,
  candidateError,
  streamAttempt,
  setStage,
  restorePreview,
}) {
  let review = null;
  setStage("reviewing");
  try {
    review = await critique({ html, brief, content, model });
    reportReview(nodeId, review);
  } catch {
    return { html, review };
  }
  if (!reviewNeedsImprovement(review)) return { html, review };

  emitAgentPanelEvent(LAYOUT_EVENT.DECISION, {
    nodeId,
    step: "auto_improve",
    message: `Optimizing layout score (${review.score}/100)`,
  });
  setStage("streaming");
  const prompt = buildImprovePrompt({
    html,
    review,
    brief,
    width,
    height,
    content,
  });
  try {
    const raw = await streamAttempt(prompt);
    const improved = extractLayoutMarkup(raw);
    if (
      !improved ||
      candidateError(improved) ||
      designSystemColorViolation(improved, designSystem)
    ) {
      restorePreview(html);
      return { html, review };
    }
    const improvedReview = await critique({
      html: improved,
      brief,
      content,
      model,
    });
    if ((improvedReview?.score ?? -1) < (review.score ?? 0)) {
      restorePreview(html);
      return { html, review };
    }
    reportReview(nodeId, improvedReview);
    return { html: improved, review: improvedReview };
  } catch {
    restorePreview(html);
    return { html, review };
  }
}
