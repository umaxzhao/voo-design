import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CustomSelect from "../../src/canvas/components/custom_select.jsx";

describe("constraint dropdown styling", () => {
  it("applies the field appearance only to the dropdown trigger", () => {
    const html = renderToStaticMarkup(
      <CustomSelect
        aria-label="Horizontal"
        className="flex-1"
        triggerClassName="rounded-xl bg-neutral-800"
        value="left"
        onChange={() => {}}
      >
        <option value="left">Left</option>
      </CustomSelect>,
    );

    expect(html).toContain('class="min-w-0 flex-1"');
    expect(html).toContain("rounded-xl bg-neutral-800");
    expect(html).not.toContain(
      'class="min-w-0 flex-1 rounded-xl bg-neutral-800',
    );
  });
});
