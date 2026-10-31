import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WelcomePromptTypes from "../../src/canvas/components/welcome_dashboard/welcome_prompt_types.jsx";

describe("welcome prompt design types", () => {
  it("shows illustrated, filled previews for the main creation types", () => {
    const html = renderToStaticMarkup(
      <WelcomePromptTypes
        t={(key) => key}
        activePill="poster"
        onSelectPill={() => {}}
      />,
    );

    expect(html.match(/role="radio"/g)).toHaveLength(8);
    expect(html).toContain("welcome.pills.poster");
    expect(html).toContain("welcome.pills.storyboard");
    expect(html).toContain("bg-mint");
    expect(html).not.toMatch(/\bborder(?:-|\s)|\bring-/);
  });
});
