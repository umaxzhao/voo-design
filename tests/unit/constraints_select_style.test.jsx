import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CustomSelect from "../../src/canvas/components/custom_select.jsx";
import ConstraintsSection from "../../src/canvas/components/editor_properties/constraints_section.jsx";

describe("constraint dropdown styling", () => {
  it("applies the field appearance only to the dropdown trigger", () => {
    const html = renderToStaticMarkup(
      <CustomSelect
        aria-label="Horizontal"
        rootClassName="flex-1"
        className="rounded-xl bg-neutral-800"
        value="left"
        onChange={() => {}}
      >
        <option value="left">Left</option>
      </CustomSelect>,
    );

    expect(html).toContain('class="min-w-0 flex-1"');
    expect(html).toContain("rounded-xl bg-neutral-800");
    expect(html.match(/rounded-xl bg-neutral-800/gu)).toHaveLength(1);
  });

  it("renders the constraint diagram as a solid centered frame with edge pins", () => {
    const html = renderToStaticMarkup(
      <ConstraintsSection
        object={{ id: "rect-1", constraints: { horizontal: "left", vertical: "top" } }}
        editAndCommit={() => {}}
      />,
    );

    expect(html).toContain('data-testid="editor-constraints-diagram"');
    expect(html).toContain("h-[60px] w-[60px]");
    expect(html).toContain("h-10 w-10");
    expect(html).toContain("bg-[#262626]");
    expect(html).not.toContain("border-white/20");
    expect(html).toContain('data-testid="editor-constraints-left"');
    expect(html).toContain('data-testid="editor-constraints-top"');
  });
});
