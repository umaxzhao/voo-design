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
      designSystemId="auto"
      designSystemOptions={[
        { id: "auto", label: "welcome.prompt.designSystemAuto", description: "" },
        { id: "axiom", label: "AXIOM", description: "Avant-garde editorial tech" },
      ]}
      onSelectDesignSystem={() => {}}
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

  it("renders a quiet default surface with advanced settings hidden", () => {
    const html = render();
    expect(html).toContain("welcome.prompt.addAttachment");
    expect(html).toContain("welcome.prompt.generationTypeLabel");
    expect(html).toContain('data-advanced-open="false"');
    expect(html).toContain("hidden");
    expect(html).not.toContain('role="radiogroup"');
  });

  it("exposes the variant count control", () => {
    const html = render({ candidates: 2, initialAdvancedOpen: true });
    expect(html).toContain("welcome.prompt.candidateN");
    expect(html).toContain("welcome.prompt.candidates");
  });

  it("exposes the design-system picker and disables the style kit once a system is chosen", () => {
    const html = render({ initialAdvancedOpen: true });
    expect(html).toContain("welcome.prompt.designSystem");
    const systemHtml = render({ designSystemId: "axiom", initialAdvancedOpen: true });
    expect(systemHtml).toContain("AXIOM");
    const styleIndex = systemHtml.indexOf('aria-label="welcome.prompt.styleLabel"');
    expect(styleIndex).toBeGreaterThan(-1);
    expect(systemHtml.slice(Math.max(0, styleIndex - 240), styleIndex)).toContain("disabled");
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

  it("keeps design-type selection in the advanced dialog", () => {
    const mobile = render({ activePill: "mobile", initialAdvancedOpen: true });
    expect(mobile).toContain('<option value="mobile" selected="">welcome.pills.mobile</option>');
    expect(mobile).not.toContain("welcome.guide.mobile");
  });
});
