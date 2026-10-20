/**
 * Turns layout-generation bus events into agent-panel items.
 *
 * A layout run started from the Design editor's prompt bar is not an agent
 * turn, but the drawer should still show what is happening: the request, the
 * model's reasoning while it writes the HTML, the stage it is in, and how it
 * ended. Keeping the mapping here as a pure function means node:test can drive
 * it without a React renderer — the panel only subscribes and renders.
 */

import { ITEM_TYPE, STATUS } from "./eventTypes.js";
import { LAYOUT_EVENT } from "../../store/agent_panel_bus.js";
import { errorText, isKnownErrorCode } from "../../error_text.js";

/** Stable item ids — one run keeps one bubble per role and updates it. */
export const LAYOUT_ITEM_ID = {
  REQUEST: "layout-request",
  THINKING: "layout-thinking",
  STATUS: "layout-status",
  DECISION: "layout-decision",
  PALETTE: "layout-palette",
  CRITIQUE: "layout-critique",
  ERROR: "layout-error",
};

/** The label for a run stage, as `generateLayout` reports it. */
const STAGE_KEY = {
  streaming: "node.layout.stage.generating",
  reviewing: "agent.layout.stage.reviewing",
  parsing: "node.layout.stage.parsing",
};

/**
 * The failure sentence for one layout error event.
 *
 * The payload carries a machine code (`cli.notInstalled`, `layoutParse`, …)
 * and the store passes it straight through, so appending `payload.message`
 * verbatim printed the raw code to the user — a run whose picker said
 * "Connected" read `cli.notInstalled` and nothing else. `errorText` owns the
 * code→copy map and keeps a distinct original message as a diagnostic suffix,
 * so the cause stays visible alongside the actionable sentence.
 *
 * A payload whose `code` is NOT one of those codes carries no code at all:
 * the store sets `code = error?.code ?? error?.message`, so the message is
 * already the human sentence and must not be wrapped in the generic prefix.
 */
function layoutErrorText(payload, t) {
  const message = payload?.message;
  if (!message) return t("agent.layout.failed");
  if (!isKnownErrorCode(payload?.code)) {
    return `${t("agent.layout.failed")} ${message}`;
  }
  return `${t("agent.layout.failed")} ${errorText({
    code: payload.code,
    message,
  })}`;
}

function upsert(items, item) {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return [...items, item];
  const next = items.slice();
  next[index] = { ...next[index], ...item };
  return next;
}

/**
 * Folds one bus event into the panel's layout items.
 *
 * @param {Array<object>} items current layout items
 * @param {{type: string, payload: object}} event bus event
 * @param {(key: string) => string} t translator
 * @returns {Array<object>} the next items (the same array when nothing changed)
 */
export function reduceLayoutEvent(items, event, t) {
  const payload = event?.payload ?? {};
  switch (event?.type) {
    case LAYOUT_EVENT.START:
      // A new run replaces the previous one's trail: the drawer shows the run
      // in flight, and the finished one is already on the canvas.
      return [
        {
          id: LAYOUT_ITEM_ID.REQUEST,
          type: ITEM_TYPE.USER_MESSAGE,
          text: payload.prompt ?? "",
        },
        {
          id: LAYOUT_ITEM_ID.STATUS,
          type: ITEM_TYPE.AGENT_MESSAGE,
          text: t(STAGE_KEY.streaming),
          status: STATUS.IN_PROGRESS,
        },
      ];
    case LAYOUT_EVENT.THINKING:
      if (!payload.text) return items;
      return upsert(items, {
        id: LAYOUT_ITEM_ID.THINKING,
        type: ITEM_TYPE.REASONING,
        text: payload.text,
        status: STATUS.IN_PROGRESS,
      });
    case LAYOUT_EVENT.DECISION:
      if (!payload.message && !payload.step) return items;
      return upsert(items, {
        id: LAYOUT_ITEM_ID.DECISION,
        type: ITEM_TYPE.AGENT_MESSAGE,
        text: payload.message || payload.step,
        status: STATUS.COMPLETED,
      });
    case LAYOUT_EVENT.PALETTE: {
      const palette = payload.palette || payload.colors || [];
      const colorList = Array.isArray(palette)
        ? palette
        : (palette.colors || [])
            .map((c) => (typeof c === "string" ? c : c?.hex))
            .filter(Boolean);
      const text = colorList.length > 0 ? colorList.join(" ") : "";
      return upsert(items, {
        id: LAYOUT_ITEM_ID.PALETTE,
        type: ITEM_TYPE.AGENT_MESSAGE,
        text: text
          ? `${t("node.layout.reference")}: ${text}`
          : t("node.layout.reference"),
        palette: colorList,
        status: STATUS.COMPLETED,
      });
    }
    case LAYOUT_EVENT.CRITIQUE: {
      const score = payload.score ?? payload.review?.score;
      const issues = payload.issues ?? payload.review?.issues ?? [];
      const scoreText =
        typeof score === "number"
          ? t("node.layout.reviewScore", { score })
          : "";
      const issueText =
        Array.isArray(issues) && issues.length > 0
          ? t("node.layout.reviewIssues", { count: issues.length })
          : "";
      const text = [scoreText, issueText].filter(Boolean).join(" • ");
      return upsert(items, {
        id: LAYOUT_ITEM_ID.CRITIQUE,
        type: ITEM_TYPE.AGENT_MESSAGE,
        text: text || t("agent.layout.stage.reviewing"),
        score,
        issues,
        status: STATUS.COMPLETED,
      });
    }
    case LAYOUT_EVENT.STAGE: {
      const key = STAGE_KEY[payload.stage];
      if (!key) return items;
      return upsert(items, {
        id: LAYOUT_ITEM_ID.STATUS,
        type: ITEM_TYPE.AGENT_MESSAGE,
        text: t(key),
        status: STATUS.IN_PROGRESS,
      });
    }
    case LAYOUT_EVENT.DONE: {
      // The reasoning bubble stays — it is the record of how the layout was
      // decided — but stops showing a live cursor.
      const settled = items
        .filter((item) => item.id !== LAYOUT_ITEM_ID.ERROR)
        .map((item) =>
          item.id === LAYOUT_ITEM_ID.THINKING
            ? { ...item, status: STATUS.COMPLETED }
            : item,
        );
      return upsert(settled, {
        id: LAYOUT_ITEM_ID.STATUS,
        type: ITEM_TYPE.AGENT_MESSAGE,
        text: t("agent.layout.done"),
        status: STATUS.COMPLETED,
      });
    }
    case LAYOUT_EVENT.ERROR:
      return upsert(
        items.filter((item) => item.id !== LAYOUT_ITEM_ID.STATUS),
        {
          id: LAYOUT_ITEM_ID.ERROR,
          type: ITEM_TYPE.ERROR,
          message: layoutErrorText(payload, t),
          // The machine code stays on the item for diagnostics — it is just
          // never the thing the user is asked to read.
          code: payload.code ?? null,
          // The fix ("choose another agent") is one line; why the app could
          // not see the CLI is a paragraph, so it waits behind the `?` hint
          // rather than sitting in the bubble on every failure.
          hintKey:
            payload.code === "cli.notInstalled"
              ? "error.cliNotInstalledHint"
              : null,
          status: STATUS.FAILED,
        },
      );
    default:
      return items;
  }
}
