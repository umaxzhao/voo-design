import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WelcomePromptTypes from "../../src/canvas/components/welcome_dashboard/welcome_prompt_types.jsx";

describe("welcome prompt design types", () => {
  it("renders exactly 8 distinct svgs, each with welcome-type-icon and welcome-type-accent", () => {
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

    // All 8 SVGs must carry welcome-type-icon class and 56x40 viewBox
    const svgs = html.match(/<svg[^>]*welcome-type-icon[^>]*>[\s\S]*?<\/svg>/g) ?? [];
    expect(svgs).toHaveLength(8);

    // Each of the 8 SVGs must have an accent highlight
    for (const svg of svgs) {
      expect(svg).toContain('viewBox="0 0 56 40"');
      expect(svg).toMatch(/welcome-type-accent(-line)?/);
    }
  });

  it("draws a distinct line icon with one brand accent for every type", () => {
    const icons = ["landing", "mobile", "web", "poster", "slides", "storyboard", "dashboard", "other"].map((id) => {
      const html = renderToStaticMarkup(
        <WelcomePromptTypes t={(key) => key} activePill={id} onSelectPill={() => {}} />,
      );
      // The checked button's icon is the one whose accent is at full strength.
      const checked = html.split('aria-checked="true"')[1].split("</button>")[0];
      expect(checked).toContain("welcome-type-accent");
      expect(checked).toContain("welcome-type-icon");
      return checked.match(/<svg[\s\S]*<\/svg>/)[0];
    });
    expect(new Set(icons).size).toBe(8);
  });
});
