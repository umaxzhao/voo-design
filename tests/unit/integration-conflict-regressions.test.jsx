import { existsSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WelcomePromptComposer } from "../../src/canvas/components/welcome_dashboard/welcome_prompt_composer.jsx";
import { renameSessionInList } from "../../src/canvas/agent/session_history.js";
import { EDITOR_MODULES, ADDITIONAL_BROWSER_CHECKS } from "../../scripts/editor-module-catalog.mjs";
import { validateModuleCatalog } from "../../scripts/editor-check-plans.mjs";

const noop = () => {};

describe("worktree integration retains accepted product contracts", () => {
  it("keeps advanced generation choices behind their single entry", () => {
    const html = renderToStaticMarkup(<WelcomePromptComposer
      t={key => key} activePill="landing" onSelectPill={noop}
      promptText="" setPromptText={noop} modelGroups={[]}
      selectedModel="" onSelectModel={noop} styleId="auto" styleOptions={[]}
      onSelectStyle={noop} size={null} sizeOptions={[]} onSelectSize={noop}
      candidates={1} onSelectCandidates={noop} attachments={[]}
      onAddAttachments={noop} onRemoveAttachment={noop} onSubmit={noop}
      designSystemId="auto" designSystemOptions={[]} onSelectDesignSystem={noop}
    />);
    expect(html).toContain('aria-label="welcome.prompt.settingsLabel"');
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain('role="dialog"');
  });

  it("rejects an empty session rename without mutating saved history", () => {
    const sessions = [{ id: "session", title: "Campaign", history: [] }];
    expect(renameSessionInList(sessions, "session", "  ")).toBe(sessions);
  });

  it("retains classification of every existing browser regression", () => {
    const discoveredSuites = readdirSync("tests/e2e")
      .filter(path => path.endsWith(".e2e.mjs")).map(path => path.slice(0, -8));
    expect(() => validateModuleCatalog(EDITOR_MODULES, existsSync, {
      discoveredSuites, additionalChecks: ADDITIONAL_BROWSER_CHECKS,
    })).not.toThrow();
  });
});
