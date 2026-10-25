import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TypeSpecificSections from "../../src/canvas/components/editor_properties/type_specific_sections.jsx";
import extendedEnglish from "../../src/shared/i18n/extended-en.js";

describe("properties panel export localization", () => {
  it("renders the Export section without CJK characters in English", () => {
    const html = renderToStaticMarkup(
      <TypeSpecificSections
        object={{ id: "node-1", kind: "rect", name: "Rectangle" }}
        sections={["export"]}
        editAndCommit={() => {}}
        engine={{}}
      />,
    );
    const englishHtml = html.replace(/editor\.[\w.]+/g, (key) => extendedEnglish[key] ?? key);
    expect(englishHtml).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
    expect(englishHtml).toContain("Export PNG");
  });
});
