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
    expect(html).toContain("Opus 5.5");
    expect(html).toContain('title="Opus 5.5"');
    expect(html).not.toContain("VOO Agent 3.5");
    expect(html).toContain("welcome.prompt.modelLabel");
  });

  it("renders a quiet default surface with advanced settings hidden", () => {
    const html = render();
    expect(html).toContain("welcome.prompt.addAttachment");
    expect(html).toContain("welcome.prompt.generationTypeLabel");
    expect(html).toContain('data-advanced-open="false"');
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain('aria-label="welcome.prompt.styleLabel"');
    expect(html).not.toContain('aria-label="welcome.prompt.designSystemLabel"');
  });

  it("exposes the variant count control", () => {
    const html = render({ candidates: 2, initialAdvancedOpen: true });
    expect(html).toContain("welcome.prompt.candidateN");
    expect(html).toContain("welcome.prompt.candidates");
  });

  it("renders advanced style selection as an accessible dropdown", () => {
    const html = render({ initialAdvancedOpen: true });
    const labelIndex = html.indexOf('aria-label="welcome.prompt.styleLabel"');
    expect(labelIndex).toBeGreaterThan(-1);
    const trigger = html.slice(html.lastIndexOf("<button", labelIndex), html.indexOf(">", labelIndex));
    expect(trigger).toContain('aria-haspopup="listbox"');
    expect(html).toContain("welcome.prompt.styleAuto");
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
    const triggers = mobile.match(/<button[^>]*aria-label="welcome.prompt.generationTypeLabel"[^>]*>/g) ?? [];
    expect(triggers).toHaveLength(2);
    expect(triggers.filter(trigger => trigger.includes('aria-haspopup="listbox"'))).toHaveLength(1);
    expect(mobile).not.toContain('role="radiogroup"');
    expect(mobile).toContain('>welcome.pills.mobile</span>');
    expect(mobile).not.toContain("<select");
    expect(mobile).not.toContain("welcome.guide.mobile");
  });
});
