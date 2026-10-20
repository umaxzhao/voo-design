/**
 * The agent's glance at the canvas.
 *
 * A text-only agent edits blind: it calls fill_selection, reads "ok", and has
 * no idea whether the hole it patched still looks like a hole. When the model
 * can see, the loop slips a thumbnail of the page into the conversation right
 * after any tool that changed pixels, so the next step reasons about what is
 * actually on screen rather than about a receipt.
 *
 * Two rules keep that affordable, and both live here as pure functions so
 * node:test can drive them without a React renderer or a model:
 *
 *  - only tools that change the picture trigger a glance;
 *  - only the newest glance keeps its image — older ones collapse to a line of
 *    text, or a ten-step retouch would carry ten full-page screenshots.
 */

/**
 * Tools whose success changes what the page looks like.
 *
 * Deliberately a list rather than a `capabilities.mutates` check: creating a
 * node or renaming a layer mutates the workflow without changing a pixel, and
 * paying for a vision round-trip on those is waste.
 */
export const PIXEL_TOOLS = new Set([
  "fill_selection",
  "repaint_selection",
  "layer_via_copy",
  "select_object",
  "refine_selection",
  "draw_vector",
  "apply_copy_structure",
  "generate_layout",
  "edit_generated_image",
  "pick_version",
]);

/** Marks the message that carries a glance so later turns can demote it. */
export const GLANCE_MARKER = "__vooCanvasGlance";

/**
 * The approval modes in which the loop may look at the canvas on its own.
 *
 * A glance changes nothing, but it does send the user's picture to a provider,
 * and the three careful modes exist precisely so that outward calls are the
 * user's decision. In those, the model can still look — it just has to call
 * `look_at_canvas` and take the approval card like any other external call.
 */
const AUTO_GLANCE_MODES = new Set(["auto-create", "full-auto", "auto-review"]);

/** Whether the loop may take a glance without asking, at this setting. */
export function shouldAutoGlance(approvalMode) {
  return AUTO_GLANCE_MODES.has(approvalMode);
}

/** Whether this tool's success is worth a look at the canvas. */
export function touchesPixels(toolName) {
  return PIXEL_TOOLS.has(toolName);
}

/**
 * The message that shows the model the page.
 *
 * It is a user-role message on purpose: a tool result must be a string, and
 * the observation is not the assistant's own words — it is what the room looks
 * like now.
 */
export function glanceMessage({ dataUrl, note }) {
  return {
    role: "user",
    [GLANCE_MARKER]: true,
    content: [
      { type: "text", text: note },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  };
}

/**
 * Attaches the picture to a message the caller already built, marking it as a
 * glance so a later turn can strip the image back out.
 *
 * Used at the start of a turn, where the alternative — pushing the picture as
 * its own message — would leave two user turns back to back, which some
 * OpenAI-compatible endpoints reject outright.
 */
export function attachGlance(message, { dataUrl, note }) {
  const blocks =
    typeof message.content === "string"
      ? [{ type: "text", text: message.content }]
      : [...(message.content ?? [])];
  blocks.push({ type: "text", text: note });
  blocks.push({ type: "image_url", image_url: { url: dataUrl } });
  message.content = blocks;
  message[GLANCE_MARKER] = true;
  return message;
}

/**
 * Strips the images out of earlier glances, in place, and reports how many
 * were collapsed.
 *
 * Only the latest view of the canvas is true; keeping the older ones would
 * both mislead the model and grow the request without bound. The words around
 * the picture survive — a glance may be riding on the user's own message, and
 * throwing away what they typed to save a few tokens would be a bad trade.
 */
export function demoteEarlierGlances(messages, staleNote) {
  let demoted = 0;
  for (const message of messages) {
    if (!message?.[GLANCE_MARKER] || typeof message.content === "string")
      continue;
    const blocks = message.content ?? [];
    if (!blocks.some((block) => block?.type === "image_url")) continue;
    const words = blocks
      .filter((block) => block?.type === "text" && block.text)
      .map((block) => block.text);
    message.content = [...words, staleNote].join("\n");
    demoted += 1;
  }
  return demoted;
}

/**
 * Decides whether a fresh snapshot is worth sending.
 *
 * An identical picture teaches the model nothing and costs a request, so a
 * tool that changed nothing visible (a no-op fill, a selection tweak the eye
 * cannot see) does not produce a glance.
 */
export function isNewView(dataUrl, previousDataUrl) {
  if (!dataUrl) return false;
  return dataUrl !== previousDataUrl;
}
