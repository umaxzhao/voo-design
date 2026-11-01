// Top project tabs: creation entry, title width and horizontal overflow.
// Start Vite, then: node tests/e2e/top-tabs-overflow.e2e.mjs
// Scope: desktop tab strip only. The mobile project switcher is out of scope.
import assert from 'node:assert/strict';
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const NEW_PROJECT = /Add project|添加项目/;
const LONG_NAME = "Quarterly marketing landing page with a deliberately long descriptive name";
const STRIP = ".canvas-tab-bar-desktop";
const TABLIST = `${STRIP} [role="tablist"]`;

const stripSnapshot = () => {
  const strip = document.querySelector('.canvas-tab-bar-desktop [role="tablist"]');
  if (!strip) return null;
  const tabs = [...strip.querySelectorAll('[data-tab-id]')];
  const box = strip.getBoundingClientRect();
  const last = tabs[tabs.length - 1];
  const lastBox = last?.getBoundingClientRect();
  return {
    count: tabs.length,
    scrollLeft: strip.scrollLeft,
    scrollWidth: strip.scrollWidth,
    clientWidth: strip.clientWidth,
    lastVisible: Boolean(
      lastBox && lastBox.right <= box.right + 1 && lastBox.left >= box.left - 1,
    ),
  };
};

// 1. Workspace home: nothing is open, so there is no project and no creation entry
//    competing with the dashboard's own New action.
await withEditorBrowser(async ({ page }) => {
  const strip = page.locator(STRIP);
  // With nothing open the strip has no children, so it has no box to be "visible".
  await strip.waitFor({ state: "attached" });
  assert.equal(await strip.getByRole('tab').count(), 0, "home must not render project tabs");
  assert.equal(
    await strip.getByRole('button', { name: NEW_PROJECT }).count(), 0,
    "the home screen must not show a tab-bar + button",
  );
  console.log("Verified: no + and no tabs on the workspace home.");
}, { openDocument: false, mcpLink: false });

await withEditorBrowser(async ({ page, tool }) => {
  page.setDefaultTimeout(30000);
  const strip = page.locator(STRIP);
  await strip.waitFor();
  const tablist = page.locator(TABLIST);
  // The reveal of a newly opened tab settles over a few frames; wait for the
  // strip to stop moving before driving the scroll position by hand.
  const settle = async () => {
    let previous = await page.evaluate(() => document.querySelector('.canvas-tab-bar-desktop [role="tablist"]').scrollLeft);
    for (let step = 0; step < 40; step += 1) {
      await page.waitForTimeout(100);
      const current = await page.evaluate(() => document.querySelector('.canvas-tab-bar-desktop [role="tablist"]').scrollLeft);
      if (Math.abs(current - previous) < 1) return;
      previous = current;
    }
  };
  const scrollLeft = () => page.evaluate(() =>
    document.querySelector('.canvas-tab-bar-desktop [role="tablist"]')?.scrollLeft ?? 0);
  // A smooth scroll keeps moving for a few frames after the click. Read only
  // once two consecutive samples agree, otherwise the arrow state computed
  // below still belongs to the previous position.
  const settledScroll = async () => {
    let previous = null;
    for (let step = 0; step < 60; step += 1) {
      const current = await scrollLeft();
      if (previous !== null && Math.abs(current - previous) < 1) return current;
      previous = current;
      await page.waitForTimeout(60);
    }
    return scrollLeft();
  };
  // One arrow step. The arrow disappears as soon as its side stops hiding
  // content, so it is re-read after every settled scroll and never clicked
  // when it is gone: a missing arrow means "nothing hidden here", and the
  // assertions after the loop still fail if content did stay hidden.
  const stepArrow = async (arrow, side) => {
    const snapshot = await page.evaluate(stripSnapshot);
    const hidden = side === "right" ? !snapshot.lastVisible : snapshot.scrollLeft > 1;
    if (!hidden) return false;
    if ((await arrow.count()) === 0) return false;
    if (!(await arrow.isVisible().catch(() => false))) return false;
    await arrow.click();
    await settledScroll();
    return true;
  };

  // 2. An open project shows the creation entry at the end of the tabs.
  await page.waitForFunction(() => document.querySelectorAll('.canvas-tab-bar-desktop [data-tab-id]').length === 1);
  assert.equal(await strip.getByRole('button', { name: NEW_PROJECT }).count(), 1, "an open project must expose +");
  const addButton = strip.getByRole('button', { name: NEW_PROJECT });

  // 6. No overflow yet: neither arrow appears, and the strip does not scroll.
  assert.equal(await strip.locator('[data-testid="tabs-scroll-left"]').count(), 0, "no left arrow without hidden tabs");
  assert.equal(await strip.locator('[data-testid="tabs-scroll-right"]').count(), 0, "no right arrow without hidden tabs");

  // 7a. The + stays inside the window while tabs are short.
  const plusInsideViewport = async (label) => {
    const box = await addButton.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box, `${label}: + must be rendered`);
    assert.ok(box.x >= 0 && box.y >= 0, `${label}: + must not sit above/left of the window`);
    assert.ok(box.x + box.width <= viewport.width, `${label}: + must not be pushed past the right edge`);
    assert.ok(box.y + box.height <= viewport.height, `${label}: + must stay inside the title bar`);
    const bar = await page.getByTestId('editor-top-bar').boundingBox();
    assert.ok(box.y + box.height <= bar.y + bar.height + 1, `${label}: + must stay inside the title bar`);
  };
  await plusInsideViewport("one tab");

  // 3. Long project names stay readable but never widen the tab without bound.
  await page.evaluate((name) => window.__vooStore.newVooProject({ label: name }), LONG_NAME);
  await page.waitForFunction(() => document.querySelectorAll('.canvas-tab-bar-desktop [data-tab-id]').length === 2);
  const longTab = tablist.getByRole('tab').last();
  assert.equal(await longTab.getAttribute('title'), LONG_NAME, "the hover title keeps the full project name");
  const longShape = await longTab.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      width: node.getBoundingClientRect().width,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflow: style.textOverflow,
    };
  });
  assert.ok(longShape.width <= 161, `a tab title must cap near 160px, saw ${longShape.width}`);
  assert.ok(longShape.scrollWidth > longShape.clientWidth, "a long name must be clipped, not wrapped");
  assert.equal(longShape.overflow, "ellipsis", "a clipped name must read as an ellipsis");

  // 4. Enough projects: the strip overflows, and opening the last one already
  //    scrolled it into view.
  await page.evaluate(() => {
    for (let index = 0; index < 20; index += 1) {
      window.__vooStore.newVooProject({ label: `Project ${index + 1}` });
    }
  });
  await page.waitForFunction(() => document.querySelectorAll('.canvas-tab-bar-desktop [data-tab-id]').length === 22);
  const rightArrow = strip.locator('[data-testid="tabs-scroll-right"]');
  const leftArrow = strip.locator('[data-testid="tabs-scroll-left"]');
  await page.waitForFunction((snapshot) => {
    const stripNode = document.querySelector('.canvas-tab-bar-desktop [role="tablist"]');
    const tabs = [...stripNode.querySelectorAll('[data-tab-id]')];
    const last = tabs[tabs.length - 1].getBoundingClientRect();
    const box = stripNode.getBoundingClientRect();
    return last.right <= box.right + 1 && last.left >= box.left - 1;
  }, null);
  // Return to the start, where the newest tabs are hidden to the right.
  await settle();
  await page.evaluate(() => { document.querySelector('.canvas-tab-bar-desktop [role="tablist"]').scrollLeft = 0; });
  await rightArrow.waitFor();
  assert.equal(await rightArrow.count(), 1, "hidden tabs to the right must offer a right arrow");
  await page.waitForFunction(() => !document.querySelector('.canvas-tab-bar-desktop [data-testid="tabs-scroll-left"]'));

  // 7b. The + never gets pushed out, even when the tabs overflow.
  await plusInsideViewport("twenty-two tabs");

  // 5. Clicking the right arrow scrolls hidden tabs into view; the left arrow
  //    appears once content is hidden behind the strip's leading edge.
  await stepArrow(rightArrow, "right");
  await page.waitForFunction(() => {
    const node = document.querySelector('.canvas-tab-bar-desktop [role="tablist"]');
    return node.scrollLeft > 0;
  });
  await leftArrow.waitFor();
  // Keep scrolling to the end; the final tab must become fully visible.
  for (let step = 0; step < 40; step += 1) {
    if (!(await stepArrow(rightArrow, "right"))) break;
  }
  await settledScroll();
  const end = await page.evaluate(stripSnapshot);
  assert.equal(end.lastVisible, true, "the last tab must scroll fully into view");
  assert.equal(await rightArrow.count(), 0, "the right arrow must disappear at the end");
  // One click is one step, not a jump home: keep stepping until the start.
  for (let step = 0; step < 40; step += 1) {
    if ((await scrollLeft()) < 1) break;
    if (!(await stepArrow(leftArrow, "left"))) break;
  }
  await page.waitForFunction(() => document.querySelector('.canvas-tab-bar-desktop [role="tablist"]').scrollLeft < 1);

  // Open a project while the strip is scrolled to the start: its tab scrolls in.
  await page.evaluate(() => { document.querySelector('.canvas-tab-bar-desktop [role="tablist"]').scrollLeft = 0; });
  await page.evaluate(() => window.__vooStore.newVooProject({ label: "Newest project" }));
  await page.waitForFunction(() => document.querySelectorAll('.canvas-tab-bar-desktop [data-tab-id]').length === 23);
  await page.waitForFunction(() => {
    const strip = document.querySelector('.canvas-tab-bar-desktop [role="tablist"]');
    const tabs = [...strip.querySelectorAll('[data-tab-id]')];
    const last = tabs[tabs.length - 1].getBoundingClientRect();
    const box = strip.getBoundingClientRect();
    return last.right <= box.right + 1 && last.left >= box.left - 1;
  });

  // Switching back to an early project keeps that tab reachable too.
  const firstId = await page.evaluate(() =>
    document.querySelector('.canvas-tab-bar-desktop [data-tab-id]').getAttribute('data-tab-id'));
  await page.evaluate((id) => window.__vooStore.switchDocument(id), firstId);
  await page.waitForFunction(() => {
    const strip = document.querySelector('.canvas-tab-bar-desktop [role="tablist"]');
    const first = strip.querySelector('[data-tab-id]').getBoundingClientRect();
    const box = strip.getBoundingClientRect();
    return first.left >= box.left - 1 && first.right <= box.right + 1;
  });

  // Closing back down to one tab restores the clean strip: no arrows.
  await page.evaluate(() => {
    const store = window.__vooStore;
    const strip = document.querySelector('.canvas-tab-bar-desktop [role="tablist"]');
    const ids = [...strip.querySelectorAll('[data-tab-id]')].map((node) => node.getAttribute('data-tab-id'));
    ids.slice(1).forEach((id) => store.closeDocument(id));
  });
  await page.waitForFunction(() => document.querySelectorAll('.canvas-tab-bar-desktop [data-tab-id]').length === 1);
  await page.waitForFunction(() =>
    !document.querySelector('.canvas-tab-bar-desktop [data-testid="tabs-scroll-right"]')
    && !document.querySelector('.canvas-tab-bar-desktop [data-testid="tabs-scroll-left"]'));
  assert.equal(await strip.getByRole('button', { name: NEW_PROJECT }).count(), 1, "+ remains after closing the extra tabs");
  void tool;
  console.log("Verified: + only with projects, 160px titles with full hover text, arrows on overflow, + always visible, active tab auto-scrolled.");
});
console.log("top-tabs-overflow: all checks passed");
