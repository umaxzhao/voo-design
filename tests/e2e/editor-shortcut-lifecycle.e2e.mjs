import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => {
    const { mountShortcutAudit } = await import("/tests/e2e/editor-shortcut-lifecycle-harness.jsx");
    window.__shortcutAudit = mountShortcutAudit();
  });
  await page.getByTestId("shortcut-focus").waitFor(); await settled();
  const bodyFocus = () => page.evaluate(() => document.activeElement?.blur());
  const calls = action => page.evaluate(action => window.__shortcutAudit.calls.filter(item => item.action === action), action);
  const x = index => page.evaluate(index => window.__shortcutAudit.engines[index].getNode(`keyboard-target-${index}`).x, index);

  await page.evaluate(() => window.__shortcutAudit.render({ version: "latest" })); await settled(); await bodyFocus();
  for (const key of ["Control+s", "Control+Shift+s", "Control+o", "Control+n"]) await page.keyboard.press(key);
  for (const action of ["save", "saveAs", "open", "new"]) assert.equal((await calls(action)).at(-1).version, "latest");
  assert.equal(await page.evaluate(() => window.__shortcutAudit.listeners.filter(item => item.owned && item.type === "keydown").length), 1);
  checks.push("rerender uses current save/save-as/open/new callbacks without re-registering capture listeners");

  await page.getByTestId("shortcut-text").fill("Keep text");
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("b");
  assert.equal(await x(0), 10); assert.equal((await calls("pie")).length, 0);
  await page.getByTestId("shortcut-contenteditable").click(); await page.keyboard.press("v");
  assert.equal((await calls("tool")).length, 0);
  await page.getByTestId("shortcut-range").focus(); await page.keyboard.press("ArrowRight");
  assert.equal(await x(0), 10);
  await page.getByTestId("shortcut-dialog").getByRole("button").focus(); await page.keyboard.press("Delete");
  assert.equal(await x(0), 10);
  checks.push("text, contenteditable, range and dialog targets keep native keys without moving or deleting artwork");

  await page.evaluate(() => window.__shortcutAudit.render({ version: "modal", modalOpen: true })); await settled();
  await page.getByTestId("shortcut-text").focus();
  await page.getByTestId("shortcut-focus-surface").click();
  assert.equal(await page.getByTestId("shortcut-text").evaluate(element => document.activeElement === element), true);
  await bodyFocus(); await page.keyboard.press("ArrowRight"); assert.equal(await x(0), 10);
  await page.keyboard.press("Control+k"); await page.keyboard.press("Control+f");
  assert.equal((await calls("palette")).at(-1).version, "modal"); assert.equal((await calls("find")).length, 0);
  checks.push("latest modal state suppresses surface focus and canvas keys while palette/find ownership remains ordered");

  await page.evaluate(() => window.__shortcutAudit.render({ version: "page-a" })); await settled(); await bodyFocus();
  await page.keyboard.down("ArrowRight"); await page.keyboard.down("ArrowRight");
  assert.equal(await x(0), 12);
  await page.evaluate(() => window.__shortcutAudit.render({ engineIndex: 1, version: "page-b" })); await settled();
  assert.deepEqual(await page.evaluate(() => window.__shortcutAudit.commits.map(items => items.length)), [1, 0]);
  await page.keyboard.up("ArrowRight");
  assert.deepEqual(await page.evaluate(() => window.__shortcutAudit.commits.map(items => items.length)), [1, 0]);
  await page.evaluate(() => window.__shortcutAudit.engines[0].undo()); assert.equal(await x(0), 10);
  assert.equal(await x(1), 10);
  checks.push("a held arrow burst commits once to its original real engine after focus switches and undoes once");

  const ownerCommits = await page.evaluate(() => window.__shortcutAudit.commits.map(items => items.length));
  await page.keyboard.down("ArrowDown");
  await page.evaluate(() => window.__shortcutAudit.render({ engineIndex: 0, version: "return-a" })); await settled();
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.up("ArrowDown"); await page.keyboard.up("ArrowLeft");
  assert.equal(await x(0), 9);
  assert.equal(await page.evaluate(() => window.__shortcutAudit.engines[1].getNode("keyboard-target-1").y), 11);
  assert.deepEqual(await page.evaluate(() => window.__shortcutAudit.commits.map(items => items.length)), ownerCommits.map(count => count + 1));
  await page.evaluate(async () => { for (const engine of window.__shortcutAudit.engines) await engine.undo(); });
  assert.equal(await x(0), 10);
  assert.equal(await page.evaluate(() => window.__shortcutAudit.engines[1].getNode("keyboard-target-1").y), 10);
  await page.evaluate(() => window.__shortcutAudit.render({ engineIndex: 1, version: "back-b" })); await settled();
  checks.push("a new arrow on the next page cannot replace the previous page's unfinished history owner");

  await page.keyboard.press("Shift+ArrowDown");
  assert.equal(await page.evaluate(() => window.__shortcutAudit.engines[1].getNode("keyboard-target-1").y), 20);
  await page.getByTestId("shortcut-range").focus(); await page.keyboard.press("Control+z");
  assert.equal((await calls("undo")).at(-1).engineIndex, 1);
  assert.equal(await page.evaluate(() => window.__shortcutAudit.engines[1].getNode("keyboard-target-1").y), 10);
  checks.push("non-text controls permit modified undo and current-page real geometry restores through history");

  await bodyFocus();
  const beforeBlur = await page.evaluate(() => window.__shortcutAudit.commits[1].length);
  await page.keyboard.down("ArrowRight");
  assert.equal(await x(1), 11);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.evaluate(() => window.__shortcutAudit.commits[1].length), beforeBlur + 1);
  await page.keyboard.up("ArrowRight");
  assert.equal(await page.evaluate(() => window.__shortcutAudit.commits[1].length), beforeBlur + 1);
  await page.evaluate(() => window.__shortcutAudit.engines[1].undo());
  assert.equal(await x(1), 10);
  checks.push("window blur finishes a real arrow burst once and later keyup cannot create another history entry");

  await bodyFocus(); await page.keyboard.down("b"); await page.keyboard.down("b");
  assert.equal((await calls("pie")).length, 1); await page.keyboard.up("b");
  await page.keyboard.press("b"); assert.equal((await calls("pie")).length, 2);
  await page.evaluate(() => window.__shortcutAudit.render({ engineIndex: 1, version: "guide", selectedGuideId: "guide-1" }));
  await settled(); await page.keyboard.press("Delete");
  assert.equal((await calls("deleteGuide")).at(-1).args[0], "guide-1");
  assert.equal(await x(1), 10);
  checks.push("family key repeat opens one pie and selected-guide Delete never removes the artwork underneath");

  const beforeDisable = await page.evaluate(() => window.__shortcutAudit.commits[1].length);
  await bodyFocus(); await page.keyboard.down("ArrowRight");
  assert.equal(await x(1), 11);
  await page.evaluate(() => window.__shortcutAudit.render({ engineIndex: 1, version: "disabled", enabled: false })); await settled();
  assert.equal(await page.evaluate(() => window.__shortcutAudit.commits[1].length), beforeDisable + 1);
  await page.keyboard.up("ArrowRight");
  await page.evaluate(() => window.__shortcutAudit.engines[1].undo());
  assert.equal(await x(1), 10);
  checks.push("disabling shortcuts finishes the originating arrow edit before removing its listeners");
  const previous = (await calls("save")).length; await page.keyboard.press("Control+s");
  assert.equal((await calls("save")).length, previous);
  await page.evaluate(() => window.__shortcutAudit.render({ engineIndex: 1, version: "enabled" })); await settled();
  await page.keyboard.press("Control+s"); assert.equal((await calls("save")).length, previous + 1);
  await page.keyboard.down("Backslash");
  assert.equal(await page.evaluate(() => window.__shortcutAudit.flags[1].at(-1)), true);
  const beforeUnmount = await page.evaluate(() => window.__shortcutAudit.commits[1].length);
  await page.keyboard.down("ArrowRight");
  assert.equal(await x(1), 11);
  await page.evaluate(() => window.__shortcutAudit.close());
  assert.equal(await page.evaluate(() => window.__shortcutAudit.commits[1].length), beforeUnmount + 1);
  assert.equal(await page.evaluate(() => window.__shortcutAudit.snapshots.at(-1).commitCount), beforeUnmount + 1);
  assert.equal(await page.evaluate(() => window.__shortcutAudit.flags[1].at(-1)), false);
  assert.equal(await page.evaluate(() => window.__shortcutAudit.listeners.filter(item => item.active && item.owned).length), 0);
  await page.keyboard.up("Backslash"); await page.keyboard.up("ArrowRight");
  await page.keyboard.press("ArrowRight"); assert.equal(await x(1), 11);
  await page.evaluate(() => window.__shortcutAudit.engines[1].undo()); assert.equal(await x(1), 10);
  await page.evaluate(() => {
    const a = window.__shortcutAudit;
    const saved = a.snapshots.at(-1).session;
    a.engines[1].restoreDocumentSession(saved);
  });
  assert.equal(await x(1), 11);
  await page.evaluate(() => window.__shortcutAudit.engines[1].undo()); assert.equal(await x(1), 10);
  await page.evaluate(() => window.__shortcutAudit.dispose());
  checks.push("unmount finishes history before passive engine snapshots, retains one-step session undo and removes every shortcut listener");
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { openDocument: false, mcpLink: false });
