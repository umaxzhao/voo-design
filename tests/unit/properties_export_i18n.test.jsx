import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ExportSection from "../../src/canvas/components/editor_properties/export_section.jsx";
import extendedEnglish from "../../src/shared/i18n/extended-en.js";

describe("properties panel export localization", () => {
  it("renders the Export section without CJK characters in English", () => {
    const html = renderToStaticMarkup(
      <ExportSection object={{ id: "shape", exportPresets: [{ id: "png", type: "image/png", scale: 1 }] }} engine={{ exportSelectionPng: () => {} }} />,
    );
    const englishHtml = html.replace(/editor\.[\w.]+/g, (key) => extendedEnglish[key] ?? key);
    expect(englishHtml).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff]/u);
    expect(englishHtml).toContain("PNG");
  });
});
