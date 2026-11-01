import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { assertPanelLayout, assertReachable, boxOf, camera, openBothPanels, prepareResponsiveModels, seedResponsiveDocument, settled, settlePanels, touch } from "./ui-responsive-editor-helpers.mjs";

const checks = [];
const families = ["select", "marquee", "brush", "pen", "shapes", "fill", "healing"];

await withEditorBrowser(async ({ page, tool }) => {
  await seedResponsiveDocument(page);
  const before = await page.evaluate(() => window.__vooEditor.serialise());
  for (const family of families) {
    const trigger = page.getByTestId(`editor-${family}-menu-trigger`);
    await trigger.click();
    const menu = page.getByTestId(`editor-${family}-menu-list`), entries = menu.getByRole("menuitem");
    assert.equal(await entries.count() > 1, true);
    const ids = await entries.evaluateAll(elements => elements.map(element => element.dataset.testid));
    assert.equal(await page.evaluate(() => document.activeElement.dataset.testid), ids[0]);
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.testid), ids[1]);
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.testid), ids.at(-1));
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await menu.waitFor({ state: "detached" });
    await trigger.click(); await page.keyboard.press("Escape");
    assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
  }
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), before, "menu arrows must not nudge artwork");
  checks.push("all seven toolbar families support real Arrow/Home/End/Enter/Escape without mutating the document");

  await page.getByTestId("editor-brush-menu-trigger").click();
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.getByTestId("editor-brush-menu-list").waitFor({ state: "detached" });
  checks.push("viewport changes dismiss fixed-position tool menus instead of leaving stale anchors");
  await page.evaluate(() => { window.__vooEditor.setTool("select"); window.__vooEditor.selectExactly(["responsive-target"]); });
  for (const [width, height] of [[390, 844], [768, 1024]]) {
    await page.setViewportSize({ width, height }); await settlePanels(page);
    await openBothPanels(page, false); await assertPanelLayout(page);
    await assertReachable(page.getByTestId("editor-contextual-taskbar"), `mouse quickbar ${width}`);
    await page.screenshot({ path: editorArtifactPath(`voo-ui-responsive-mouse-${width}-verified.png`) });
    checks.push(`${width}px fine-pointer viewport uses separate responsive panels instead of overlapping desktop inspectors`);
  }
  await page.locator(".voo-ai-fab").click();
  await page.getByTestId("agent-composer-model-pill").click();
  const emptyMenu = page.getByTestId("agent-model-menu");
  await emptyMenu.waitFor();
  assert.equal(await emptyMenu.getByRole("menuitemradio").count(), 0);
  const configure = emptyMenu.getByRole("menuitem");
  await assertReachable(configure, "empty catalog configuration entry");
  await page.keyboard.press("Home");
  assert.equal(await configure.evaluate(element => document.activeElement === element), true);
  await configure.click();
  await page.getByTestId("settings-drawer").waitFor();
  checks.push("without a local CLI or API, the real empty picker offers a reachable keyboard-accessible configuration entry");
}, { preparePage: page => prepareResponsiveModels(page, false) });

await withEditorBrowser(async ({ page, tool }) => {
  await seedResponsiveDocument(page);
  const session = await page.context().newCDPSession(page);
  // Resize the same live editor across breakpoints; fresh-page screenshots alone
  // miss stale panel sizing and portalled controls retaining desktop anchors.
  for (const [width, height] of [[390, 844], [320, 568], [768, 1024], [844, 390], [390, 844]]) {
    await page.setViewportSize({ width, height }); await settlePanels(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width <= 768) {
      await openBothPanels(page); await assertPanelLayout(page);
      if (width <= 390) {
        for (const [label, key, value] of [["X", "x", 75], ["W", "width", 175]]) {
          const field = page.getByTestId("editor-properties-panel").getByRole("spinbutton", { name: label, exact: true });
          await field.scrollIntoViewIfNeeded(); await assertReachable(field, `${width}px ${label} field`);
          const readable = await field.evaluate(element => {
            const style = getComputedStyle(element), context = document.createElement("canvas").getContext("2d");
            context.font = `${style.fontSize} ${style.fontFamily}`;
            return { available: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 15, text: context.measureText(element.value).width };
          });
          assert.ok(readable.available >= readable.text, `${label} numeric value clipped at ${width}px: ${JSON.stringify(readable)}`);
          const previous = await page.evaluate(key => window.__vooEditor.getNode("responsive-target")[key], key);
          await field.tap(); await field.fill(String(value)); await field.press("Enter");
          try {
            await page.waitForFunction(({ key, value }) => window.__vooEditor.getNode("responsive-target")[key] === value, { key, value }, { timeout: 3000 });
          } catch (error) {
            const state = await page.evaluate(() => ({ selection: window.__vooEditor.getSelectedIds(), nodes: window.__vooEditor.getDocument().nodes, inputs: [...document.querySelectorAll('[data-testid="editor-properties-panel"] input')].map(input => [input.getAttribute("aria-label"), input.value]) }));
            throw new Error(`${width}px ${label}=${value} did not apply: ${JSON.stringify(state)}`, { cause: error });
          }
          assert.equal(await page.evaluate(key => window.__vooEditor.getNode("responsive-target")[key], key), value);
          await tool("undo");
          assert.equal(await page.evaluate(key => window.__vooEditor.getNode("responsive-target")[key], key), previous);
          await page.waitForFunction(({label,previous}) => document.querySelector(`[data-testid="editor-properties-panel"] input[aria-label="${label}"]`)?.value === String(previous), {label,previous});
          await settled(page);
        }
        await page.getByTestId("editor-properties-panel").evaluate(element => { element.scrollTop = 0; });
        checks.push(`${width}px inspector: X/W text is readable, trusted taps edit values, Enter commits and one undo restores`);
      }
      const quickbar = page.getByTestId("editor-contextual-taskbar");
      await assertReachable(quickbar, `quickbar ${width}`);
      const before = await boxOf(quickbar);
      await page.evaluate(() => window.__responsiveStore.setState(state => ({ editorCamera: { ...state.editorCamera, panX: state.editorCamera.panX + 17, panY: state.editorCamera.panY + 13 } })));
      await settled(page);
      const after = await boxOf(quickbar);
      assert.ok(Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1, JSON.stringify({ before, after }));
      await page.screenshot({ path: editorArtifactPath(`voo-ui-responsive-${width}-verified.png`) });
    } else {
      await assertPanelLayout(page);
      await page.screenshot({ path: editorArtifactPath("voo-ui-responsive-landscape-verified.png") });
    }
    const bottom = page.getByTestId("editor-bottom-toolbar");
    for (const control of await bottom.locator(":scope > button:visible, :scope > div > button:visible").all()) {
      const bounds = await assertReachable(control, `zoom control ${width}`);
      if (width <= 768) assert.ok(bounds.width >= 48 && bounds.height >= 48);
    }
    checks.push(`${width}×${height}: live resize retains separate rounded panels and a reachable camera-independent quickbar`);
  }

  // Full family tiles must retain their touch routes after horizontal scrolling.
  for (const family of families) {
    const root = page.getByTestId(`editor-${family}-menu`);
    const button = root.locator('[data-toolbar-touch-tool]');
    await button.scrollIntoViewIfNeeded();
    const bounds = await assertReachable(button, `${family} touch target`);
    assert.ok(bounds.width >= 48 && bounds.height >= 48);
    const menu = page.getByTestId(`editor-${family}-menu-list`);
    await button.tap();
    if (!(await menu.isVisible())) await button.tap();
    await assertReachable(menu.getByRole("menuitem").last(), `${family} last item`);
    await menu.getByRole("menuitem").last().tap(); await menu.waitFor({ state: "detached" });
  }
  checks.push("all family touch tiles remain 48px, activate first, open on the active tap, and reach their final options");

  await page.evaluate(() => { window.__vooEditor.setTool("select"); window.__vooEditor.selectExactly(["responsive-target"]); });
  const quickbar = page.getByTestId("editor-contextual-taskbar");
  const actionMenu = quickbar.getByTestId("editor-taskbar-align-menu");
  if (await actionMenu.count()) {
    await actionMenu.scrollIntoViewIfNeeded(); await actionMenu.tap();
    const menu = page.getByTestId("editor-taskbar-align-options");
    await assertReachable(menu, "grouped alignment menu");
    await page.keyboard.press("End"); await page.keyboard.press("Escape");
    assert.equal(await actionMenu.evaluate(element => document.activeElement === element), true);
  }

  await page.evaluate(() => window.__responsiveStore.setState(state => ({ editorCamera: { ...state.editorCamera, zoom: 0.8 } })));
  await settled(page);
  const zoomBefore = (await camera(page)).zoom;
  const more = page.getByTestId("editor-more-menu-trigger");
  await more.tap();
  const moreMenu = page.getByTestId("editor-more-menu");
  await assertReachable(moreMenu, "bottom more menu");
  const first = await page.evaluate(() => document.activeElement.textContent);
  await page.keyboard.press("ArrowDown");
  assert.notEqual(await page.evaluate(() => document.activeElement.textContent), first);
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await moreMenu.waitFor({ state: "detached" });
  assert.equal(await more.evaluate(element => document.activeElement === element), true);
  await page.getByTestId("editor-zoom-percent").tap();
  assert.equal((await camera(page)).zoom, 1);
  assert.notEqual(zoomBefore, 1);
  checks.push("bottom More supports all-item keyboard navigation, Escape focus return, and zoom reset remains reachable");

  const beforePinch = await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise()));
  const fingers = [{ id: 101, x: 120, y: 200 }, { id: 102, x: 200, y: 200 }];
  await touch(session, "touchStart", fingers);
  await touch(session, "touchMove", [fingers[0], { ...fingers[1], x: 240 }]);
  await touch(session, "touchEnd", []); await settled(page);
  assert.ok((await camera(page)).zoom > 1, "trusted two-finger spread must zoom the shared camera");
  assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise())), beforePinch);
  checks.push("trusted CDP pinch zooms the real camera without changing document pixels or nodes");

  const layerPanel = page.getByTestId("editor-layers-panel");
  const panelBounds = await boxOf(layerPanel);
  const start = { id: 103, x: panelBounds.x + 8, y: panelBounds.y + 24 };
  await touch(session, "touchStart", [start]);
  await touch(session, "touchMove", [{ ...start, y: start.y + 36 }]);
  await touch(session, "touchEnd", []); await settlePanels(page);
  assert.equal(await layerPanel.locator(".editor-mobile-panel-toggle").getAttribute("aria-expanded"), "false");
  const collapsed = await boxOf(layerPanel);
  const up = { id: 104, x: collapsed.x + 8, y: collapsed.y + 24 };
  await touch(session, "touchStart", [up]);
  await touch(session, "touchMove", [{ ...up, y: up.y - 36 }]);
  await touch(session, "touchEnd", []); await settlePanels(page);
  assert.equal(await layerPanel.locator(".editor-mobile-panel-toggle").getAttribute("aria-expanded"), "true");
  checks.push("trusted header swipes collapse and restore mobile layers without swallowing later clicks");

  for (const [width, height] of [[320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height }); await settlePanels(page);
    const fab = page.locator(".voo-ai-fab");
    await assertReachable(fab, "agent opener"); await fab.tap();
    // The section's accessible name comes from i18n; scope by its model pill to
    // avoid coupling this check to the current locale's panel title.
    const pill = page.getByTestId("agent-composer-model-pill");
    await pill.waitFor();
    const suggestions = page.getByTestId("agent-selection-suggestions").getByRole("button");
    for (const suggestion of [suggestions.first(), suggestions.last()]) {
      await suggestion.scrollIntoViewIfNeeded();
      await assertReachable(suggestion, `selection suggestion ${width}`);
      await suggestion.tap();
    }
    assert.ok((await page.locator(".agent-composer textarea").inputValue()).trim());
    await assertReachable(pill, `agent model pill ${width}`); await pill.tap();
    const menu = page.getByTestId("agent-model-menu");
    const firstFrame = await assertReachable(menu, `agent model menu first frame ${width}`);
    await settled(page);
    const finalFrame = await assertReachable(menu, `agent model menu ${width}`);
    assert.ok(Math.abs(firstFrame.y - finalFrame.y) < 1, JSON.stringify({ firstFrame, finalFrame }));
    await page.keyboard.press("End");
    await assertReachable(menu.getByRole("menuitemradio").last(), "last configured model after End");
    await page.keyboard.press("Home");
    const option = menu.getByRole("menuitemradio").first();
    assert.equal(await menu.getByRole("menuitemradio").count(), 32);
    await assertReachable(option, "first model after Home");
    await page.keyboard.press("Escape");
    assert.equal(await pill.evaluate(element => document.activeElement === element), true);
    await page.screenshot({ path: editorArtifactPath(`voo-ui-agent-${width}-verified.png`) });
    const close = page.locator('aside section header button').last();
    if (width > 768) {
      assert.equal(await page.getByTestId("editor-layers-panel").isVisible(), false);
      assert.equal(await page.getByTestId("editor-properties-panel").isVisible(), false);
      const editor = await boxOf(page.getByTestId("design-editor"));
      assert.ok(editor.width > width - 30, JSON.stringify(editor));
    }
    await assertReachable(close, `agent close ${width}`); await close.tap();
    await fab.waitFor(); await settlePanels(page);
    if (width <= 768) await assertPanelLayout(page);
    checks.push(`${width}×${height}: assistant opens, model options scroll/focus, Escape returns focus, close restores canvas panels without sending`);
  }

  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 12, right: 10, bottom: 8, left: 6 } });
  await settlePanels(page);
  assert.deepEqual(await page.locator(".app-root-frame").evaluate(element => {
    const s = getComputedStyle(element); return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat);
  }), [16, 14, 12, 14]);
  await assertReachable(page.getByTestId("editor-zoom-percent"), "safe-area zoom");
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 0, bottom: 0, left: 0 } });
  await session.detach();
  checks.push("safe-area changes preserve physical insets with symmetric horizontal margins and reachable navigation");
}, { viewport: { width: 1440, height: 1000 }, hasTouch: true,
  preparePage: page => prepareResponsiveModels(page, true) });

console.log(JSON.stringify({ passed: checks }, null, 2));
