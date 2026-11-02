import { createAuthoredFrame } from "./authored-frame-fixture.mjs";
import assert from "node:assert/strict";

/** Catalog layout must not depend on CLIs installed on the test host. No API
 * credentials or generation are needed to exercise the actual picker UI. */
export async function prepareResponsiveModels(page, configured) {
  await page.route("**/health", route => route.abort());
  await page.addInitScript(configured => {
    localStorage.setItem("voo.custom_providers", JSON.stringify(configured ? [{
      id: "responsive-api", name: "Responsive API", baseUrl: "https://responsive.invalid/v1",
      models: Array.from({ length: 32 }, (_, index) => ({
        id: `layout-${index + 1}`, label: `Layout Model ${index + 1}`,
      })),
    }] : []));
  }, configured);
}

export const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

export async function settlePanels(page) {
  await settled(page);
  await page.evaluate(() => Promise.all(document.querySelector('[data-testid="design-editor"]')
    .getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition)
    .map(animation => animation.finished.catch(() => {}))));
  await settled(page);
}

export async function seedResponsiveDocument(page) {
  await createAuthoredFrame(page);
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const engine = window.__vooEditor, doc = engine.getDocument();
    const frame = doc.nodes.find(node => node.isFrame);
    engine.setDoc({ ...doc, nodes: [
      { ...frame, x: 0, y: 0, width: 600, height: 400, fill: "#171717" },
      { id: "responsive-target", kind: "rect", parentId: frame.id, x: 50, y: 60, width: 180, height: 100, fill: "#eeeeee", visible: true },
    ] });
    engine.selectExactly(["responsive-target"]); engine.setTool("select");
    window.__responsiveStore = useDesignStore;
  });
  await settled(page);
}

export const boxOf = locator => locator.evaluate(element => element.getBoundingClientRect().toJSON());
export async function assertReachable(locator, label = "control") {
  const geometry = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { ...rect.toJSON(), reachable: element === hit || element.contains(hit), viewport: [innerWidth, innerHeight], interceptedBy: hit?.outerHTML.slice(0, 200) };
  });
  assert.ok(geometry.width > 0 && geometry.height > 0 && geometry.reachable, `${label}: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.x >= 0 && geometry.y >= 0 && geometry.right <= geometry.viewport[0] + 1 && geometry.bottom <= geometry.viewport[1] + 1, `${label} outside viewport: ${JSON.stringify(geometry)}`);
  return geometry;
}

export async function assertPanelLayout(page) {
  const panels = await page.locator('[data-testid="editor-layers-panel"], [data-testid="editor-properties-panel"]').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return { ...element.getBoundingClientRect().toJSON(), radius: parseFloat(style.borderRadius), widthOverflow: element.scrollWidth - element.clientWidth };
  }));
  const viewport = page.viewportSize();
  for (const panel of panels) {
    assert.ok(panel.x >= 6 && panel.right <= viewport.width - 6 && panel.bottom <= viewport.height - 6, JSON.stringify({ panel, viewport }));
    assert.ok(panel.radius >= 12 && panel.widthOverflow <= 1, JSON.stringify(panel));
  }
  assert.ok(panels[0].right <= panels[1].x || panels[1].right <= panels[0].x, JSON.stringify(panels));
}

export async function openBothPanels(page, useTouch = true) {
  for (const id of ["editor-layers-panel", "editor-properties-panel"]) {
    const toggle = page.getByTestId(id).locator('.editor-mobile-panel-toggle');
    await assertReachable(toggle, `${id} toggle`);
    if (await toggle.getAttribute("aria-expanded") !== "true") {
      if (useTouch) await toggle.tap(); else await toggle.click();
    }
  }
  await settlePanels(page);
}

export const camera = page => page.evaluate(() => ({ ...window.__responsiveStore.getState().editorCamera }));
export const touch = (session, type, points) => session.send("Input.dispatchTouchEvent", {
  type, touchPoints: points.map(point => ({ ...point, radiusX: 1, radiusY: 1, force: 1 })),
});
