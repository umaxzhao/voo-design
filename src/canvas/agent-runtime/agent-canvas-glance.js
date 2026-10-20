/**
 * Canvas glance: show the model the page as it stands now.
 *
 * Silent by design: a glance is an extra, and a closed editor or a provider
 * that cannot see must never take a turn down with it. Only a genuinely new
 * picture is sent — an edit that changed nothing visible teaches the model
 * nothing and still costs a request.
 *
 * Extracted from useAgentLoop (AO3c). React-free.
 *
 * @module agent-runtime/agent-canvas-glance
 */

import { visionModelFor } from "../../shared/providers.js";
import {
  attachGlance,
  demoteEarlierGlances,
  glanceMessage,
  isNewView,
  shouldAutoGlance,
} from "../components/agent-panel/canvas_glance.js";

export async function glanceAtCanvasNow({
  note,
  mergeIntoLast = false,
  approvalMode,
  apiKey,
  providerId,
  model,
  getStore,
  lastGlanceRef,
  messagesRef,
}) {
  if (!shouldAutoGlance(approvalMode)) return false;
  if (!apiKey || !visionModelFor(providerId, model)) return false;
  const store = getStore?.();
  if (typeof store?.runEditorCommand !== "function") return false;
  let exported;
  try {
    exported = await store.runEditorCommand({
      tool: "export_canvas_png",
      args: { maxEdge: 768 },
    });
  } catch (error) {
    // No editor open is the ordinary case, not a failure worth reporting.
    if (
      error?.code !== "EDITOR_NOT_OPEN" &&
      error?.code !== "BITMAP_MISSING"
    ) {
      console.warn("canvas glance failed", error);
    }
    return false;
  }
  if (!isNewView(exported?.dataUrl, lastGlanceRef.current)) return false;
  demoteEarlierGlances(
    messagesRef.current,
    "[An earlier view of the canvas — superseded by the current one below.]",
  );
  lastGlanceRef.current = exported.dataUrl;
  const last = messagesRef.current.at(-1);
  // Two user turns in a row are rejected by some OpenAI-compatible
  // endpoints, so the opening glance rides on the user's own message; a
  // glance after a tool result follows a tool turn and stands alone.
  if (mergeIntoLast && last?.role === "user") {
    attachGlance(last, { dataUrl: exported.dataUrl, note });
  } else {
    messagesRef.current.push(
      glanceMessage({ dataUrl: exported.dataUrl, note }),
    );
  }
  return true;
}
