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

describe("welcome prompt composer (Pen app parity)", () => {
  it("shows the real provider model instead of a decorative label", () => {
    const html = render();
    expect(html).toContain("Opus 5.5");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-label="welcome.prompt.modelLabel"');
    expect(html).not.toContain("VOO Agent 3.5");
  });

  it("shows a platform mark beside the compact model and tier", () => {
    const html = render({
      modelGroups: [{
        cliId: "antigravity",
        name: "Antigravity",
        models: [{ id: "antigravity:gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" }],
      }],
      selectedModel: "antigravity:gemini-3.8-flash-medium",
    });

    expect(html).toContain("brand-icons/antigravity.svg");
    expect(html).toContain("3.8 FlashMedium");
    expect(html).not.toContain("Antigravity ·");
  });

  it("renders Pen-style generation type pills at the top", () => {
    const html = render({ activePill: "mobile" });
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('welcome.pills.landing');
    expect(html).toContain('welcome.pills.mobile');
    expect(html).toContain('welcome.pills.web');
    expect(html).toContain('welcome.pills.slides');
    expect(html).toContain('welcome.pills.dashboard');
    expect(html).toContain('welcome.pills.other');
    // mobile is selected
    expect(html).toMatch(/aria-checked="true"[^>]*>.*welcome\.pills\.mobile/);
  });

  it("renders the prompt box with placeholder and ambient glow", () => {
    const html = render();
    expect(html).toContain('placeholder="welcome.prompt.placeholder"');
    expect(html).toContain('welcome-prompt-glow');
  });

  it("exposes the Pen-style parallel agents control (⚡ 1x)", () => {
    const html = render();
    expect(html).toContain('aria-label="Parallel agents"');
    expect(html).toContain('>1x<');
    expect(html).toContain('lucide-zap');
  });

  it("exposes the Pen-style variant count control (⊞ 1x)", () => {
    const html = render({ candidates: 2 });
    expect(html).toContain('aria-label="welcome.prompt.candidates"');
    expect(html).toContain('>2x<');
    expect(html).toContain('lucide-layout-grid');
  });

  it("renders Add to Context (+) button and submit button", () => {
    const html = render();
    expect(html).toContain('aria-label="welcome.prompt.addAttachment"');
    expect(html).toContain('aria-label="welcome.actions.createNowTitle"');
  });

  it("renders attachment chips with a remove action", () => {
    const html = render({
      attachments: [{ kind: "image", name: "reference.png", dataUrl: "data:image/png;base64,xx" }],
    });
    expect(html).toContain("reference.png");
    expect(html).toContain("welcome.prompt.removeAttachment");
  });
});
