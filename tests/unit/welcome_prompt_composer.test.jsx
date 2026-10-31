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
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-label="welcome.prompt.modelLabel"');
    expect(html).not.toContain("VOO Agent 3.5");
    expect(html).toContain("welcome.prompt.modelLabel");
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

  it("shows the active design type's prompt guide in the input", () => {
    const html = render({ activePill: "mobile" });
    expect(html).toContain('placeholder="welcome.prompt.mobilePlaceholder"');
    expect(html).toContain('aria-label="welcome.prompt.mobilePlaceholder"');
  });

  it("keeps illustrated types and advanced settings behind one entry", () => {
    const html = render();
    expect(html).toContain("welcome.prompt.addAttachment");
    expect(html).not.toContain("welcome.prompt.generationTypeLabel");
    expect(html).toContain('data-advanced-open="false"');
    expect(html).not.toContain("data-mobile-options-open");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("welcome.pills.poster");
    expect(html).not.toContain('aria-label="welcome.prompt.styleLabel"');
    expect(html).not.toContain('aria-label="welcome.prompt.designSystemLabel"');
  });

  it("keeps model selection separate from advanced generation settings", () => {
    const html = render({ initialAdvancedOpen: true });
    const modelIndex = html.indexOf('aria-label="welcome.prompt.modelLabel"');
    const advancedIndex = html.indexOf('role="dialog"');
    expect(html.match(/role="radio"/g)).toHaveLength(8);
    expect(html).toContain("welcome.pills.poster");
    expect(html).toContain("welcome.pills.storyboard");
    expect(modelIndex).toBeGreaterThan(-1);
    expect(advancedIndex).toBeGreaterThan(modelIndex);
    expect(html.slice(advancedIndex)).not.toContain('aria-label="welcome.prompt.modelLabel"');
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
  it("keeps one candidate selector in the advanced panel and leaves the animated rim to shared CSS", () => {
    const closed = render();
    const open = render({ initialAdvancedOpen: true });
    expect(closed).not.toContain('aria-label="welcome.prompt.candidates"');
    expect(open.match(/aria-label="welcome.prompt.candidates"/g)).toHaveLength(1);
    const form = /<form[^>]*class="([^"]+)"/.exec(closed)?.[1];
    expect(form).toContain("prompt-composer");
    expect(form).not.toMatch(/\bbg-|\bborder(?:-|\s)/);
  });

  it("renders attachment chips with a remove action", () => {
    const html = render({
      attachments: [{ kind: "image", name: "reference.png", dataUrl: "data:image/png;base64,xx" }],
    });
    expect(html).toContain("reference.png");
    expect(html).toContain("welcome.prompt.removeAttachment");
  });

  it("shows illustrated design types above the composer and keeps advanced options grouped", () => {
    const mobile = render({ activePill: "mobile", initialAdvancedOpen: true });
    const settingsTrigger = mobile.match(/<button[^>]*aria-label="welcome.prompt.settingsLabel"[^>]*>/g) ?? [];
    expect(settingsTrigger).toHaveLength(1);
    expect(mobile).toContain('role="radiogroup"');
    expect(mobile.match(/role="radio"/g)).toHaveLength(8);
    expect(mobile).toContain('aria-label="welcome.prompt.settingsLabel"');
    expect(mobile).toContain('>welcome.pills.mobile</span>');
    expect(mobile).not.toContain("<select");
    expect(mobile).not.toContain("welcome.guide.mobile");
  });
});
