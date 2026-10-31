import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Suggestions, {
  appendSuggestion,
  selectionSuggestions,
} from "../../src/canvas/components/agent-panel/agent_selection_suggestions.jsx";
import zh from "../../src/shared/i18n/extended-zh.js";
import en from "../../src/shared/i18n/extended-en.js";

describe("selection-aware Agent suggestions", () => {
  it("distinguishes images, frames, text, and vectors", () => {
    expect(selectionSuggestions({ kind: "image" })).toContain("referenceImage");
    expect(selectionSuggestions({ kind: "frame" })).toContain("redesign");
    expect(selectionSuggestions({ kind: "text" })).toContain("rewrite");
    expect(selectionSuggestions({ kind: "path" })).toContain("palette");
    expect(selectionSuggestions(null)).toEqual([]);
  });
  it("keeps same-type multi-selection specific and mixed selections general", () => {
    expect(
      selectionSuggestions({
        selection: [{ kind: "image" }, { kind: "image" }],
      }),
    ).toContain("referenceImage");
    expect(
      selectionSuggestions({
        selection: [{ kind: "image" }, { kind: "text" }],
      }),
    ).toEqual(["layout", "unifyStyle", "redesign"]);
    expect(selectionSuggestions({ layerType: "frame" })).toContain("redesign");
  });
  it("preserves drafts and makes repeat clicks idempotent", () => {
    expect(appendSuggestion("", "Guide")).toBe("Guide");
    expect(appendSuggestion("Use blue", "Guide")).toBe("Use blue\nGuide");
    expect(appendSuggestion("Use blue\nGuide", "Guide")).toBe(
      "Use blue\nGuide",
    );
  });
  it("has localized labels and actionable prompts for every supported selection", () => {
    for (const dictionary of [zh, en]) {
      for (const kind of ["image", "frame", "text", "shape", "unknown"]) {
        const ids = selectionSuggestions({ kind });
        expect(ids).toHaveLength(3);
        for (const id of ids) {
          expect(dictionary[`agent.panel.guide.${id}.label`]).toBeTruthy();
          expect(
            dictionary[`agent.panel.guide.${id}.prompt`].length,
          ).toBeGreaterThan(15);
        }
      }
    }
  });
  it("renders compact suggestions with non-submit buttons and disables them during a turn", () => {
    const html = renderToStaticMarkup(
      <Suggestions
        context={{ kind: "image" }}
        busy
        onPick={() => {}}
        t={(key) => zh[key]}
      />,
    );
    expect(html).toContain("参考生图");
    expect(html.match(/type="button"/g)).toHaveLength(3);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(
      renderToStaticMarkup(
        <Suggestions context={null} onPick={() => {}} t={(key) => key} />,
      ),
    ).toBe("");
  });
});
