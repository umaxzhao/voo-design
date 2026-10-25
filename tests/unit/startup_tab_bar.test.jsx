import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useDesignStore } from "../../src/store/design_store.js";

// Server rendering reads zustand's initial snapshot; read the live state instead.
vi.mock("../../src/store/design_store.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useDesignStore: Object.assign((selector) => selector(actual.useDesignStore.getState()), actual.useDesignStore) };
});
vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: (key) => key }) }));
import CanvasTabBar from "../../src/canvas/components/canvas_tab_bar.jsx";

describe("title bar tabs at startup", () => {
  it("renders no document tab on the welcome page, only the new-tab button", () => {
    useDesignStore.setState(useDesignStore.getInitialState(), true);
    const html = renderToStaticMarkup(<CanvasTabBar />);
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain("Untitled");
    expect(html).toContain("canvasTabs.new");
  });

  it("renders exactly one tab after New from welcome", () => {
    useDesignStore.setState(useDesignStore.getInitialState(), true);
    useDesignStore.getState().newVooProject();
    const html = renderToStaticMarkup(<CanvasTabBar />);
    expect(html.match(/role="tab"/g)).toHaveLength(1);
    expect(html).toContain("Design 1");
    expect(html).not.toContain("Untitled");
  });
});
