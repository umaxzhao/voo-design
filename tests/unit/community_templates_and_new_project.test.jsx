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

  it("renders Figma Community style templates view with cards, authors, stats, and search", () => {
    const html = renderToStaticMarkup(
      React.createElement(CommunityTemplatesView, { onUseTemplate: () => {} })
    );

    // Verify community template titles appear
    expect(html).toContain("SaaS Analytics &amp; Cloud Metric Dashboard");
    expect(html).toContain("iOS 18 Mobile Banking &amp; Digital Wallet");
    expect(html).toContain("Bento Grid AI Product Landing Page");
    expect(html).toContain("Universal Design System &amp; UI Kit");

    // Verify authors and stats appear
    expect(html).toContain("Alex Rivera");
    expect(html).toContain("Elena Rostova");
    expect(html).toContain("Design Tokens WG");

    // Verify action buttons appear
    expect(html).toContain("使用模板");
    expect(html).toContain("预览详情");
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
    expect(activeState.nodes[0].data.editorDoc.nodes.length).toBe(78);
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

  it("welcome dashboard renders AI generation types row without 'All' filter pill", () => {
    const html = renderToStaticMarkup(React.createElement(WelcomeDashboard));

    // Verify AI generation header label
    expect(html).toContain("AI 生成类型");

    // Verify generation types are present
    expect(html).toContain("落地页");
    expect(html).toContain("移动应用");
    expect(html).toContain("Web 应用");
    expect(html).toContain("幻灯片");
    expect(html).toContain("数据看板");
    expect(html).toContain("其他创意…");

    // Verify '全部' is NOT in the AI generation radiogroup
    // (radiogroup has role="radiogroup" aria-label="AI 生成类型")
    expect(html).not.toMatch(/role="radiogroup"[^>]*>[\s\S]*<span>全部<\/span>/);
  });

  it("AI_GEN_TYPES defines tailored dimensions, categories, and placeholders for AI generation", () => {
    expect(AI_GEN_TYPES.length).toBe(6);
    expect(AI_GEN_TYPES.some((t) => t.id === "all")).toBe(false);

    const ids = AI_GEN_TYPES.map((t) => t.id);
    expect(ids).toEqual(["landing", "mobile", "web", "slides", "dashboard", "other"]);

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
