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
    expect(html.match(/<svg[^>]*viewBox="0 0 56 40"/g)).toHaveLength(8);
    expect(html).toContain("fill-accent-mint");
    expect(html).not.toMatch(/\bborder(?:-|\s)|\bring-/);
  });

  it("draws a distinct line icon with one brand accent for every type", () => {
    const icons = ["landing", "mobile", "web", "poster", "slides", "storyboard", "dashboard", "other"].map((id) => {
      const html = renderToStaticMarkup(
        <WelcomePromptTypes t={(key) => key} activePill={id} onSelectPill={() => {}} />,
      );
      // The checked button's icon is the one whose accent is at full strength.
      const checked = html.split('aria-checked="true"')[1].split("</button>")[0];
      expect(checked).toContain("welcome-type-accent");
      return checked.match(/<svg[\s\S]*<\/svg>/)[0];
    });
    expect(new Set(icons).size).toBe(8);
  });
});
