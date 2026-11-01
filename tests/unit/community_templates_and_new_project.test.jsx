// Polyfills for Node.js test environment
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}
if (typeof globalThis.CustomEvent === "undefined") {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, params = {}) {
      super(type, params);
      this.detail = params.detail || null;
    }
  };
}

const mockStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

globalThis.window.localStorage = mockStorage;
globalThis.localStorage = mockStorage;

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WelcomeDashboard, {
  AI_GEN_TYPES,
} from "../../src/canvas/components/welcome_dashboard.jsx";
import CommunityTemplatesView from "../../src/canvas/components/community_templates_view.jsx";
import {
  COMMUNITY_TEMPLATES,
  COMMUNITY_CATEGORIES,
} from "../../src/canvas/components/community_templates_data.js";
import {
  workspaceStorage,
  resetWorkspaceStorage,
} from "../../src/services/workspace_storage.js";
import { useDesignStore } from "../../src/store/design_store.js";
import { encodeVooBinary } from "../../src/canvas/store/voo_binary.js";
import { addRecentFile, getRecentFiles } from "../../src/canvas/store/recent_files.js";
import { loadLocale } from "../../src/shared/i18n.js";

describe("Community Templates and New Project Workbench Experience", () => {
  beforeEach(async () => {
    mockStorage.clear();
    resetWorkspaceStorage();
    workspaceStorage.switchDriver("web-idb");
    await loadLocale("zh");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("COMMUNITY_TEMPLATES data contains authentic multi-node documents", () => {
    expect(COMMUNITY_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(COMMUNITY_CATEGORIES.length).toBeGreaterThanOrEqual(6);

    for (const tmpl of COMMUNITY_TEMPLATES) {
      expect(tmpl.id).toBeDefined();
      expect(tmpl.title).toBeDefined();
      expect(tmpl.category).toBeDefined();
      expect(typeof tmpl.createDoc).toBe("function");

      const doc = tmpl.createDoc();
      expect(doc).toBeDefined();
      expect(doc.width).toBeGreaterThan(0);
      expect(doc.height).toBeGreaterThan(0);
      expect(Array.isArray(doc.nodes)).toBe(true);
      expect(doc.nodes.length).toBeGreaterThan(10); // Rich scene graph with real nodes
    }
  });

  it("renders compact templates with localized titles, dimensions, and persistent actions", () => {
    const html = renderToStaticMarkup(<CommunityTemplatesView onUseTemplate={() => {}} />);
    expect(html).toContain('data-testid="community-templates"');
    expect(html).toContain("数据看板");
    expect(html).toContain("移动钱包");
    expect(html).toContain("1440 × 900 px");
    expect(html.match(/data-testid="use-template"/g)).toHaveLength(COMMUNITY_TEMPLATES.length);
    expect(html).toContain("预览: 数据看板");
    expect(html).not.toContain("Alex Rivera");
    expect(html).not.toContain("lucide-heart");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("lucide-sparkles");
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("renders English template controls and titles", async () => {
    await loadLocale("en");
    const html = renderToStaticMarkup(<CommunityTemplatesView />);
    expect(html).toContain("Search templates");
    expect(html).toContain("Analytics dashboard");
    expect(html).toContain("Preview: Mobile wallet");
    expect(html).not.toContain("使用");
    expect(html).not.toContain("社区");
  });

  it("instantiating a community template produces a valid .voo file and registers in workspace", async () => {
    const template = COMMUNITY_TEMPLATES[0]; // SaaS Analytics
    const doc = template.createDoc();
    const pageId = `page-${Date.now().toString(36)}`;
    doc.id = pageId;

    const vooFile = {
      format: "voo",
      version: 2,
      kind: "design",
      document: doc,
      assets: {},
    };

    const bytes = encodeVooBinary(vooFile);
    expect(bytes.length).toBeGreaterThan(100);

    const saved = await workspaceStorage.writeFileBytes(
      `${template.title}.voo`,
      bytes,
      { category: template.category }
    );
    expect(saved.ok).toBe(true);
    expect(saved.name).toContain("SaaS Analytics");

    addRecentFile({
      name: saved.name,
      path: saved.path,
      category: template.category,
      isDraft: false,
    });

    // Verify it is discovered in workspaceStorage scan
    const files = await workspaceStorage.scanFiles();
    expect(files.some((f) => f.name.includes("SaaS Analytics"))).toBe(true);

    // Verify it is discovered in recent files
    const recents = getRecentFiles();
    expect(recents.some((r) => r.name.includes("SaaS Analytics"))).toBe(true);

    // Load into design store
    useDesignStore.getState().loadVooProject({
      vooData: vooFile,
      filePath: saved.path,
      fileName: saved.name,
    });

    const activeState = useDesignStore.getState();
    expect(activeState.welcomeOpen).toBe(false);
    expect(activeState.fileName).toContain("SaaS Analytics");
    const migrated = activeState.nodes[0].data.editorDoc;
    expect(migrated.nodes).toHaveLength(vooFile.document.nodes.length + 1);
    expect(migrated.nodes[0]).toMatchObject({ isFrame: true });
    expect(migrated.nodes.slice(1)).toEqual(vooFile.document.nodes.map(node =>
      node.parentId ? node : { ...node, parentId: migrated.nodes[0].id }));
  });

  it("newVooProject in designStore registers in recent drafts automatically", () => {
    useDesignStore.getState().newVooProject({ label: "My New Web App" });

    const recents = getRecentFiles({ draftsOnly: true });
    expect(recents.some((r) => r.name === "My New Web App.voo")).toBe(true);

    const activeState = useDesignStore.getState();
    expect(activeState.fileName).toBe("My New Web App.voo");
    expect(activeState.welcomeOpen).toBe(false);
  });

  it("welcome dashboard renders the community templates nav button", () => {
    const html = renderToStaticMarkup(React.createElement(WelcomeDashboard));
    expect(html).toContain("社区模板");
  });

  it("keeps welcome dashboard content usable on phones while preserving desktop breakpoints", () => {
    const html = renderToStaticMarkup(React.createElement(WelcomeDashboard));
    expect(html).toContain("w-full shrink-0 flex-col");
    expect(html).toContain("lg:w-60");
    expect(html).toContain("p-4 lg:p-8");
    expect(html).toContain("grid grid-cols-1 sm:grid-cols-3");
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("prompt-composer relative");
    expect(html).toContain("min-w-0");
  });

  it("stacks welcome dashboard sidebar above main on phones and restores row layout on lg", () => {
    const html = renderToStaticMarkup(React.createElement(WelcomeDashboard));

    // Root: column on phones so the main column keeps height; row from lg up (desktop unchanged).
    const root = /<div\b[^>]*\bclass="[^"]*\bwelcome-dashboard\b[^"]*"/.exec(html);
    if (!root) throw new Error("welcome dashboard root is missing");
    expect(root[0]).toContain("flex-col lg:flex-row");

    // Sidebar: capped height on phones so main content stays visible; uncapped on lg.
    const aside = /<aside\b[^>]*>/.exec(html);
    if (!aside) throw new Error("welcome sidebar is missing");
    expect(aside[0]).toContain("max-h-[34dvh]");
    expect(aside[0]).toContain("lg:max-h-none");

    // Main: may shrink in the column layout so its own overflow-y-auto scrolls.
    const main = /<main\b[^>]*>/.exec(html);
    if (!main) throw new Error("welcome main column is missing");
    expect(main[0]).toContain("min-h-0");
    expect(main[0]).toContain("overflow-y-auto");
  });

  it("renders 8 design types directly on home with radiogroup and leaves other settings in dialog", () => {
    const html = renderToStaticMarkup(React.createElement(WelcomeDashboard));
    expect(html).toContain('role="radiogroup"');
    const radios = html.match(/role="radio"/g) ?? [];
    expect(radios).toHaveLength(8);
  });

  it("AI_GEN_TYPES defines tailored dimensions, categories, and placeholders for AI generation", () => {
    expect(AI_GEN_TYPES.length).toBe(8);
    expect(AI_GEN_TYPES.some((t) => t.id === "all")).toBe(false);

    const ids = AI_GEN_TYPES.map((t) => t.id);
    expect(ids).toEqual(["landing", "mobile", "web", "poster", "slides", "storyboard", "dashboard", "other"]);

    const mobile = AI_GEN_TYPES.find((t) => t.id === "mobile");
    expect(mobile.width).toBe(393);
    expect(mobile.height).toBe(852);
    expect(mobile.placeholder).toBe("welcome.prompt.mobilePlaceholder");

    const slides = AI_GEN_TYPES.find((t) => t.id === "slides");
    expect(slides.width).toBe(1920);
    expect(slides.height).toBe(1080);
    expect(slides.placeholder).toBe("welcome.prompt.slidesPlaceholder");

    const dashboard = AI_GEN_TYPES.find((t) => t.id === "dashboard");
    expect(dashboard.width).toBe(1440);
    expect(dashboard.height).toBe(960);
    expect(dashboard.placeholder).toBe("welcome.prompt.dashboardPlaceholder");
  });
});
