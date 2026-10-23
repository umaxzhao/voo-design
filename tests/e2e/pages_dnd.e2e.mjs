// Start Vite, then: flock /tmp/voo-e2e.lock node tests/e2e/pages_dnd.e2e.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60000);
  await page.goto(process.env.VOO_URL || "http://127.0.0.1:5247/?voo-test=1");
  await page.evaluate(async () => {
    const { useDesignStore: store } = await import("/src/store/design_store.js");
    store.getState().setWelcomeOpen(false);
    store.setState({ nodes: [], editingNodeId: null, editingNodeIds: [] });
    for (const label of ["封面", "Page 1", "Page 2", "Page 3"]) store.getState().addEditorPage({ label });
  });
  const switcher = page.getByTestId("page-switcher");
  await switcher.locator(":scope > button").click();
  const screenshot = suffix => page.screenshot({ path: `${process.env.VOO_SCREENSHOT_DIR || "/workspace/tmp"}/pages-dnd-${suffix}.png`, timeout: 60000 });
  const state = () => page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const s = useDesignStore.getState();
    return { labels: s.nodes.map(n => n.data.label), focus: s.editingNodeId, dirty: s.isDirty };
  });
  await screenshot("after");
  assert.equal(await switcher.locator("svg.lucide-pencil, svg.lucide-chevron-up, li svg.lucide-chevron-down").count(), 0);
  await switcher.getByRole("button", { name: "Page 1", exact: true }).dblclick();
  const input = switcher.locator("input");
  await input.fill("  Details  ");
  await screenshot("after-rename");
  await input.press("Enter");
  assert.equal((await state()).labels[1], "Details");
  await switcher.getByRole("button", { name: "Details", exact: true }).dblclick();
  await input.fill("Cancelled");
  await input.press("Escape");
  assert.equal((await state()).labels[1], "Details");
  await switcher.getByRole("button", { name: "Details", exact: true }).dblclick();
  await input.fill("   ");
  await input.press("Tab");
  assert.equal((await state()).labels[1], "Details");
  await switcher.getByRole("button", { name: "Details", exact: true }).dblclick();
  await input.fill("Details renamed");
  await input.press("Tab");
  assert.equal((await state()).labels[1], "Details renamed");
  const focus = (await state()).focus;
  const source = await switcher.getByRole("button", { name: "Page 3", exact: true }).boundingBox();
  const target = await switcher.locator("li").first().boundingBox();
  await page.mouse.move(source.x + 60, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 60, source.y - 12, { steps: 5 });
  await page.mouse.move(target.x + 60, target.y + 3, { steps: 12 });
  await page.mouse.move(target.x + 61, target.y + 3);
  await switcher.getByTestId("page-drop-indicator").waitFor();
  await screenshot("after-drag");
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-testid="page-switcher"] li button')?.textContent === "Page 3");
  assert.deepEqual((await state()).labels, ["Page 3", "封面", "Details renamed", "Page 2"]);
  assert.equal((await state()).focus, focus, "drag must preserve focus");
  assert.equal((await state()).dirty, true);
  await switcher.getByRole("button", { name: "Page 2", exact: true }).click();
  assert.notEqual((await state()).focus, focus, "single click switches pages");
  console.log("PASS pages: Enter/blur rename, empty revert, Escape cancel, native drag reorder, focus preserved, single click");
} finally {
  await browser.close();
}
