// Mobile bottom spacing: the zoom cluster and the contextual taskbar must sit
// just above the collapsed Layers/Properties strips — not 100+px above them.
// Collapsed-only: expanding a panel keeps its existing geometry.
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const COLLAPSED_GAP_MIN = 8;
const COLLAPSED_GAP_MAX = 16;
const TASKBAR_GAP = 8;
const TASKBAR_GAP_TOLERANCE = 1;
/** Expanded panels keep their pre-existing offset; only the collapsed gap changes. */
const EXPANDED_GAP = 4;

/** Collapsed panel strip top edge, or the expanded panel top edge. */
async function measure(page) {
  return page.evaluate(() => {
    const box = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
    };
    const pick = (selector) => box(document.querySelector(selector));
    const strips = [
      pick('[data-testid="editor-layers-panel"]'),
      pick('[data-testid="editor-properties-panel"]'),
      pick('[data-testid="editor-history-panel"]'),
    ].filter(Boolean);
    const editor = document.querySelector('[data-testid="design-editor"]');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      zoom: pick('[data-testid="editor-bottom-toolbar"]'),
      taskbar: pick('[data-testid="editor-contextual-taskbar"]'),
      panelTop: strips.length ? Math.min(...strips.map((strip) => strip.top)) : null,
      panelBottom: strips.length ? Math.max(...strips.map((strip) => strip.bottom)) : null,
      panelHeights: strips.map((strip) => Math.round(strip.height)),
      narrow: editor?.classList.contains("editor-narrow") ?? false,
      layersExpanded: editor?.getAttribute("data-mobile-layers-expanded"),
    };
  });
}

function report(viewport, state, m) {
  const gap = m.panelTop == null || !m.zoom ? null : m.panelTop - m.zoom.bottom;
  const taskbarGap = m.taskbar && m.zoom ? m.zoom.top - m.taskbar.bottom : null;
  console.log(
    `${viewport} ${state}: zoom=${m.zoom ? `${Math.round(m.zoom.top)}..${Math.round(m.zoom.bottom)} (h${Math.round(m.zoom.height)})` : "none"}` +
      ` panelTop=${m.panelTop == null ? "none" : Math.round(m.panelTop)} gap=${gap == null ? "n/a" : Math.round(gap)}` +
      ` taskbarGap=${taskbarGap == null ? "n/a" : taskbarGap.toFixed(1)} narrow=${m.narrow} heights=${m.panelHeights.join("/")}`,
  );
  return { gap, taskbarGap };
}

async function selectRect(page) {
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    const doc = editor.getDocument();
    if (!doc.nodes.some((node) => node.id === "rect-bottom-spacing")) {
      const rect = { ...createRectNode({ x: 100, y: 100, width: 100, height: 100 }), id: "rect-bottom-spacing" };
      editor.setDoc({ ...doc, nodes: [...doc.nodes, rect] });
    }
    editor.select("rect-bottom-spacing");
  });
  await page.getByTestId("editor-contextual-taskbar").waitFor();
}

async function clearSelection(page) {
  await page.evaluate(() => {
    const editor = window.__vooEditor;
    if (typeof editor?.selectExactly === "function") editor.selectExactly([]);
    else editor?.select?.(null);
  });
  await page.locator('[data-testid="editor-contextual-taskbar"]').waitFor({ state: "hidden" });
}

function assertCollapsed(viewport, state, m) {
  assert.ok(m.narrow, `${viewport} ${state}: editor must be in narrow (mobile) layout`);
  assert.ok(m.zoom, `${viewport} ${state}: zoom cluster is missing`);
  assert.ok(m.panelTop != null, `${viewport} ${state}: collapsed panel strips are missing`);

  const { gap, taskbarGap } = report(viewport, state, m);
  assert.ok(
    gap >= COLLAPSED_GAP_MIN && gap <= COLLAPSED_GAP_MAX,
    `${viewport} ${state}: gap between the zoom cluster and the collapsed strip must be ${COLLAPSED_GAP_MIN}-${COLLAPSED_GAP_MAX}px, got ${gap?.toFixed(1)}px`,
  );
  assert.ok(m.zoom.bottom <= m.panelTop, `${viewport} ${state}: zoom cluster overlaps the collapsed strip`);
  assert.ok(m.zoom.top >= 0 && m.zoom.bottom <= m.viewport.height, `${viewport} ${state}: zoom cluster leaves the viewport`);

  if (m.taskbar) {
    assert.ok(
      Math.abs(taskbarGap - TASKBAR_GAP) <= TASKBAR_GAP_TOLERANCE,
      `${viewport} ${state}: taskbar bottom must sit ~${TASKBAR_GAP}px above the zoom cluster, got ${taskbarGap?.toFixed(1)}px`,
    );
    assert.ok(m.taskbar.top >= 0, `${viewport} ${state}: taskbar leaves the viewport`);
  }
}

await withEditorBrowser(async ({ page, errors }) => {
  for (const viewport of ["390x844", "360x640"]) {
    const [width, height] = viewport.split("x").map(Number);
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"]')?.classList.contains("editor-narrow"));
    await page.waitForTimeout(250);

    await clearSelection(page);
    await page.waitForTimeout(250);
    const unselected = await measure(page);
    assertCollapsed(viewport, "unselected", unselected);

    await selectRect(page);
    await page.waitForTimeout(250);
    const selected = await measure(page);
    assertCollapsed(viewport, "selected", selected);
  }

  // Expanded layers must keep its existing layout: the zoom cluster follows the
  // expanded offset instead of the collapsed one, and never covers the panel.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"]')?.classList.contains("editor-narrow"));
  await page.waitForTimeout(250);
  const toggle = page.locator('[data-testid="editor-layers-panel"] .editor-mobile-panel-toggle').first();
  await toggle.waitFor();
  await toggle.click();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="design-editor"]')?.getAttribute("data-mobile-layers-expanded") === "true");
  await page.waitForTimeout(300);

  const expanded = await measure(page);
  const expandedGap = expanded.panelTop - expanded.zoom.bottom;
  console.log(
    `390x844 layers-expanded: zoom=${Math.round(expanded.zoom.top)}..${Math.round(expanded.zoom.bottom)}` +
      ` panelTop=${Math.round(expanded.panelTop)} gap=${expandedGap.toFixed(1)} heights=${expanded.panelHeights.join("/")}`,
  );
  assert.ok(expanded.zoom, "layers-expanded: zoom cluster is missing");
  assert.ok(expanded.panelTop != null, "layers-expanded: layers panel is missing");
  assert.ok(
    expanded.zoom.bottom <= expanded.panelTop,
    `layers-expanded: zoom cluster must stay above the expanded panel (zoom.bottom=${expanded.zoom.bottom}, panelTop=${expanded.panelTop})`,
  );
  assert.ok(expanded.zoom.top >= 0, "layers-expanded: zoom cluster leaves the viewport");
  // The expanded branch keeps its pre-existing 0.25rem offset: this change only
  // alters the collapsed gap, so expanding a panel must not move the cluster.
  assert.ok(
    Math.abs(expandedGap - EXPANDED_GAP) <= 1,
    `layers-expanded: expanded offset changed, expected ~${EXPANDED_GAP}px, got ${expandedGap.toFixed(1)}px`,
  );
  assert.ok(
    expanded.zoom.bottom < expanded.viewport.height - COLLAPSED_GAP_MAX,
    "layers-expanded: the cluster must still follow the expanded panel, not the collapsed strip",
  );

  assert.deepEqual(errors, []);
  console.log("Mobile bottom spacing passed.");
});
