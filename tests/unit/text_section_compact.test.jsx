// The text panel keeps the common controls on screen and folds the rest, while
// every numeric field states its unit.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import TextSection from "../../src/canvas/components/editor_properties/text_section.jsx";

const object = {
  id: "t1",
  kind: "text",
  text: "Hello",
  x: 0,
  y: 0,
  width: 120,
  height: 40,
  fontFamily: "Inter",
  fontSize: 32,
  fontWeight: 400,
  lineHeight: 1.25,
  letterSpacing: 0,
  paragraphSpacing: 0,
  boxWidth: 0,
  textCase: "original",
};

function render(patch = {}) {
  const node = { ...object, ...patch };
  return renderToStaticMarkup(
    <TextSection
      object={node}
      selectedNodes={[node]}
      edit={() => {}}
      editAndCommit={() => {}}
      commitNow={() => {}}
    />,
  );
}

describe("compact text section", () => {
  it("folds advanced controls but keeps them mounted for assistive tech", () => {
    const html = render();
    expect(html).toContain("editor.props.moreTextOptions");
    expect(html).toContain("editor.props.widthMode");
    expect(html).toContain("editor.props.textDirection");
    expect(html).toContain("hidden");
  });

  it("always offers paragraph spacing even at the default 0", () => {
    expect(render()).toContain("editor.props.paragraphSpacing");
  });

  it("shows units on size, line height and letter spacing", () => {
    const html = render();
    expect(html).toContain('value="125"');
    expect(html).toContain("px");
    expect(html).toContain("%");
  });

  it("lists each font weight once (400 reads as Regular)", () => {
    const html = render();
    const normalOptions = html.match(/editor\.props\.weight\.normal/g) ?? [];
    const boldOptions = html.match(/editor\.props\.weight\.700/g) ?? [];
    expect(normalOptions).toHaveLength(1);
    expect(boldOptions).toHaveLength(1);
    expect(html).not.toContain("editor.props.weight.400");
  });

  it("keeps path-text controls inside the fold", () => {
    const html = render({
      textPath: {
        points: [],
        startOffset: 0,
        side: "top",
        reverse: false,
      },
    });
    expect(html).toContain("editor.props.pathTextOffsetShort");
    expect(html).toContain("editor.props.pathTextOutside");
  });
});
