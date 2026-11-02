import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  fileName: "Design 1.voo",
  isDirty: true,
  welcomeOpen: false,
  openDocuments: [
    { id: "a", fileName: "Design 1.voo", isDirty: true },
    { id: "b", fileName: "Other.voo", isDirty: false },
  ],
  activeDocumentId: "a",
  switchDocument: () => {},
  closeDocument: () => {},
  newVooProject: () => {},
  setWelcomeOpen: () => {},
}));
vi.mock("../../src/store/design_store.js", () => ({ useDesignStore: (selector) => selector(state) }));
vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../../src/canvas/components/settings_drawer.jsx", () => ({ default: () => null }));
import AppTitleBar from "../../src/app_title_bar.jsx";
import CanvasTabBar from "../../src/canvas/components/canvas_tab_bar.jsx";

/** Returns the opening tag of the first element whose markup contains the given attribute text. */
function openingTag(html, attr) {
  const match = html.match(new RegExp(`<[a-z]+[^>]*${attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*>`));
  if (!match) throw new Error(`No element with ${attr}`);
  return match[0];
}

describe("title bar hit targets", () => {
  it("gives the close button a 28px no-drag hit area without growing the tab", () => {
    const tag = openingTag(renderToStaticMarkup(<CanvasTabBar />), 'aria-label="canvasTabs.close"');
    expect(tag).toContain("size-7");
    expect(tag).toContain("-m-1.5");
    expect(tag).toContain("no-drag");
  });

  it("makes the tab label button fill the full tab height", () => {
    const tag = openingTag(renderToStaticMarkup(<CanvasTabBar />), 'role="tab"');
    expect(tag).toContain("h-full");
  });

  it("gives the settings button a 28px no-drag hit area", () => {
    vi.stubGlobal("window", {});
    let html;
    try {
      html = renderToStaticMarkup(<AppTitleBar />);
    } finally {
      vi.unstubAllGlobals();
    }
    const tag = openingTag(html, 'aria-label="welcome.settings.open"');
    expect(tag).toContain("size-7");
    expect(tag).toContain("-m-1");
    expect(tag).toContain("no-drag");
  });

  it.each([[false, true], [true, false]])(
    "shows the share trigger only in the editor (welcome=%s)", (welcomeOpen, shown) => {
      state.welcomeOpen = welcomeOpen;
      vi.stubGlobal("window", {});
      let html;
      try {
        html = renderToStaticMarkup(<AppTitleBar />);
      } finally {
        state.welcomeOpen = false;
        vi.unstubAllGlobals();
      }
      if (!shown) {
        expect(html).not.toContain("collab.share");
        return;
      }
      const tag = openingTag(html, 'aria-haspopup="dialog"');
      expect(tag).toContain("h-7");
      expect(tag).toContain("no-drag");
      // The share trigger sits in the right group, before the Open action.
      expect(html.indexOf("collab.share")).toBeGreaterThan(html.indexOf("canvasTabs"));
      expect(html.indexOf("collab.share")).toBeLessThan(html.indexOf("titlebar.openTitle"));
    },
  );

  it("names the unsaved indicator only on dirty tabs", () => {
    const html = renderToStaticMarkup(<CanvasTabBar />);
    const tag = openingTag(html, 'aria-label="canvasTabs.unsaved"');
    expect(tag).toContain('role="img"');
    const indicators = html.match(/<span[^>]*role="img"[^>]*aria-label="canvasTabs\.unsaved"[^>]*>/g) ?? [];
    expect(indicators).toHaveLength(2); // One desktop indicator and one active mobile indicator.
    state.isDirty = false;
    try {
      expect(renderToStaticMarkup(<CanvasTabBar />)).not.toContain('aria-label="canvasTabs.unsaved"');
    } finally { state.isDirty = true; }
  });
});
