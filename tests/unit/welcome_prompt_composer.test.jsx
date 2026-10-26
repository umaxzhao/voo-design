// Polyfill the browser globals this component's imports touch in Node.
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomePromptComposer } from "../../src/canvas/components/welcome_dashboard/welcome_prompt_composer.jsx";

const t = (key) => key;

function render(overrides = {}) {
  return renderToStaticMarkup(
    <WelcomePromptComposer
      t={t}
      activePill="landing"
      onSelectPill={() => {}}
      promptText=""
      setPromptText={() => {}}
      modelLabel="Claude Code · Opus 5.5"
      modelGroups={[
        {
          cliId: "claude",
          name: "Claude Code",
          models: [{ id: "claude:claude-opus-5-5", label: "Claude Opus 5.5" }],
        },
      ]}
      selectedModel="claude:claude-opus-5-5"
      onSelectModel={() => {}}
      styleId="auto"
      styleOptions={[
        { id: "linear", name: "Linear Dark", mood: "Restrained dark tool", swatch: ["#0B0B0F", "#101014", "#5E6AD2"] },
      ]}
      onSelectStyle={() => {}}
      size={{ width: 1440, height: 900 }}
      sizeOptions={[{ id: "1440x900", width: 1440, height: 900 }]}
      onSelectSize={() => {}}
      attachments={[]}
      candidates={1}
      onSelectCandidates={() => {}}
      onAddAttachments={() => {}}
      onRemoveAttachment={() => {}}
      onSubmit={() => {}}
      {...overrides}
    />,
  );
}

describe("welcome prompt composer", () => {
  it("shows the real provider model instead of a decorative label", () => {
    const html = render();
    expect(html).toContain("Claude Code · Opus 5.5");
    expect(html).not.toContain("VOO Agent 3.5");
    expect(html).toContain("welcome.prompt.modelLabel");
  });

  it("renders style, size and guidance controls", () => {
    const html = render();
    expect(html).toContain("welcome.prompt.styleAuto");
    expect(html).toContain("1440 × 900");
    expect(html).toContain("welcome.guide.landing");
    expect(html).toContain("welcome.prompt.addAttachment");
  });

  it("exposes the variant count control", () => {
    const html = render({ candidates: 2 });
    expect(html).toContain("welcome.prompt.candidateN");
    expect(html).toContain("welcome.prompt.candidates");
  });

  it("does not show a decorative 1x parallel badge", () => {
    const html = render();
    expect(html).not.toContain(">1x<");
  });

  it("renders attachment chips with a remove action", () => {
    const html = render({
      attachments: [{ kind: "image", name: "reference.png", dataUrl: "data:image/png;base64,xx" }],
    });
    expect(html).toContain("reference.png");
    expect(html).toContain("welcome.prompt.removeAttachment");
  });

  it("switches the guidance line with the selected design type", () => {
    const html = render({ activePill: "mobile" });
    expect(html).toContain("welcome.guide.mobile");
    expect(html).not.toContain("welcome.guide.landing");
  });
});
