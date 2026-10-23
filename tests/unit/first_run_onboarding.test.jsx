import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import FirstRunOnboarding from "../../src/canvas/components/first_run_onboarding.jsx";
import { FIRST_RUN_KEY, finishFirstRun, shouldShowFirstRun } from "../../src/canvas/components/first_run_state.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";
import { loadLocale } from "../../src/shared/i18n.js";
import { readFileSync } from "node:fs";

describe("commercial first run", () => {
  beforeEach(() => {
    setSetting(FIRST_RUN_KEY, null);
    setSetting("voo.onboarding.completedVersion", null);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("defaults to showing for a new user", () => expect(shouldShowFirstRun()).toBe(true));
  it.each(["completed", "dismissed"])("persists %s and never shows again", (status) => {
    finishFirstRun(status);
    expect(getSetting(FIRST_RUN_KEY)).toBe(status);
    expect(shouldShowFirstRun()).toBe(false);
    // Workspace setup remaining incomplete must not bring the introduction back.
    setSetting("voo.workspace.path", "");
    expect(shouldShowFirstRun()).toBe(false);
  });
  it("does not interrupt existing workspace-guide users", () => {
    setSetting("voo.onboarding.completedVersion", "2.2.0");
    expect(shouldShowFirstRun()).toBe(false);
  });
  it("bypasses browser automation", () => {
    vi.stubGlobal("navigator", { webdriver: true });
    expect(shouldShowFirstRun()).toBe(false);
  });
  it.each(["en", "zh"])("renders translated dialog and actions in %s", async (locale) => {
    await loadLocale(locale);
    const html = renderToStaticMarkup(<FirstRunOnboarding open onClose={() => {}} onStart={() => {}} />);
    expect(html).toContain("first-run-title");
    expect(html).toContain("Cmd/Ctrl+K");
    expect(html).toContain(locale === "en" ? "Start a blank document" : "新建空白文档");
    expect(html).not.toContain("firstRun.");
  });
  it("renders nothing when closed", () => {
    expect(renderToStaticMarkup(<FirstRunOnboarding open={false} onClose={() => {}} onStart={() => {}} />)).toBe("");
  });
  it("keeps workspace setup manual on app launch", () => {
    const app = readFileSync(new URL("../../src/App.jsx", import.meta.url), "utf8");
    expect(app).toContain("[onboardingOpen, setOnboardingOpen] = useState(false)");
    expect(app).toContain('addEventListener("voo:open-onboarding"');
    expect(app).not.toContain("shouldShowOnboarding");
  });
});
