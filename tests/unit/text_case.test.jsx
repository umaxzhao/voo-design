// Text case: drawing/layout uses the cased lines while the content stays as typed.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import { applyTextCase, textLines } from "../../src/canvas/editor/scene_model_groups.js";
import TextSection from "../../src/canvas/components/editor_properties/text_section.jsx";

describe("text case", () => {
  it("uppercases, lowercases and title-cases", () => {
    expect(applyTextCase("Hello World", "upper")).toBe("HELLO WORLD");
    expect(applyTextCase("Hello World", "lower")).toBe("hello world");
    expect(applyTextCase("hello wORLD", "title")).toBe("Hello World");
    expect(applyTextCase("Hello", "original")).toBe("Hello");
    expect(applyTextCase("Hello", undefined)).toBe("Hello");
  });

  it("draws cased lines but leaves node.text untouched", () => {
    const node = { text: "Hello World", textCase: "upper" };
    expect(textLines(node)).toEqual(["HELLO WORLD"]);
    expect(node.text).toBe("Hello World");
  });

  it("renders the text case control", () => {
    const object = {
      id: "t1",
      kind: "text",
      text: "Hi",
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.2,
      letterSpacing: 0,
      textAlign: "left",
      textCase: "upper",
    };
    const html = renderToStaticMarkup(
      <TextSection
        object={object}
        selectedNodes={[object]}
        edit={() => {}}
        editAndCommit={() => {}}
        commitNow={() => {}}
      />,
    );
    expect(html).toContain("editor.props.textCase");
    expect(html).toContain("editor.props.textCase.upper");
  });
});
