import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, errors }) => {
  const editor = page.getByTestId("design-editor");
  const brand = page
    .getByTestId("editor-top-bar")
    .getByRole("button", { name: "VOO Design", exact: true });
  await page.evaluate(() => window.__vooEditor.setTool("text"));
  const before = await page.evaluate(() =>
    JSON.stringify(window.__vooEditor.getDocument()),
  );
  await brand.click();
  await page.locator(".welcome-prompt-root").waitFor();
  assert.equal(
    await editor.evaluate((el) => el.inert),
    true,
    "Covered editor must be inert",
  );
  for (let index = 0; index < 25; index++) {
    await page.keyboard.press("Tab");
    assert.equal(
      await editor.evaluate((el) => el.contains(document.activeElement)),
      false,
      "Tab must not enter the covered editor",
    );
  }
  await brand.click();
  await editor.waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument())),
    before,
    "Welcome return preserves document",
  );
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ agentPanelOpen: true });
    const e = window.__vooEditor;
    e.setTool("select");
    e.selectExactly([e.getDocument().nodes.find((n) => n.isFrame).id]);
  });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="design-editor"]')
      ?.classList.contains("editor-narrow"),
  );
  const layers = page.getByTestId("editor-layers-panel"),
    properties = page.getByTestId("editor-properties-panel");
  // Long page names must not cover either collapsed headers or camera controls.
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          label: "A very long project canvas name for navigation bounds",
        },
      })),
    }));
  });
  const assertNavigationClear = async () => {
    const nav = await page.getByTestId("page-switcher").boundingBox();
    const layer = await layers.boundingBox();
    const zoom = await page.getByTestId("editor-bottom-toolbar").boundingBox();
    assert.ok(
      nav.y + nav.height <= layer.y,
      "Page navigation leaves the layer header and footer clear",
    );
    assert.ok(
      nav.y + nav.height <= zoom.y || zoom.y + zoom.height <= nav.y,
      "Page navigation and zoom use separate vertical bands",
    );
    assert.ok(
      nav.x + nav.width <=
        (await editor.boundingBox()).x + (await editor.boundingBox()).width,
      "Long titles stay in the canvas",
    );
  };
  await assertNavigationClear();
  await layers.getByRole("button", { name: /Expand layers/i }).click();
  await properties.getByRole("button", { name: /Expand properties/i }).click();
  await assertNavigationClear();
  const l = await layers.boundingBox(),
    p = await properties.boundingBox();
  assert.ok(
    l.x + l.width <= p.x || p.x + p.width <= l.x,
    "Inspector and layers must not overlap",
  );
  const toolbar = await page.getByTestId("editor-toolbar").boundingBox(),
    root = await editor.boundingBox();
  assert.ok(
    toolbar.x >= root.x && toolbar.x + toolbar.width <= root.x + root.width,
    "Toolbar fits actual canvas",
  );
  assert.equal(
    await page.getByTestId("frame-slot-section").count(),
    0,
    "Empty slots are opt-in",
  );
  await properties
    .getByTestId("properties-add-menu")
    .getByRole("button")
    .click();
  await properties.getByTestId("properties-add-slot").click();
  await page.getByTestId("frame-slot-section").waitFor();
  await page.screenshot({ path: "/tmp/voo-impeccable-fixed-tablet.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await brand.click();
  const sidebar = page.getByTestId("welcome-sidebar");
  assert.equal(
    await sidebar.isVisible(),
    false,
    "Narrow mouse navigation uses the existing compact menu",
  );
  await page.locator(".welcome-prompt-root").waitFor({ state: "visible" });
  await page.getByTestId("mobile-project-switcher").click();
  await page.getByRole("menuitem", { name: /Search files/i }).click();
  await page.locator(".welcome-mobile-search").waitFor({ state: "visible" });
  await page.screenshot({ path: "/tmp/voo-impeccable-fixed-welcome.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: /Shortcuts.*Guide/i }).click();
  const guide = page
    .getByText("Project folders", { exact: true })
    .locator("..")
    .locator("p");
  assert.deepEqual(
    await guide.evaluate((el) => ({
      size: getComputedStyle(el).fontSize,
      line: getComputedStyle(el).lineHeight,
    })),
    { size: "15px", line: "24px" },
  );
  assert.deepEqual(errors, []);
  console.log(
    "Verified hidden focus, preserved document, canvas-width panels, toolbar and narrow welcome.",
  );
});
