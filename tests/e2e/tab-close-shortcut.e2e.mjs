import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

/**
 * Regression for beta.3 item 5: Electron's Window > Close bound Ctrl+W to
 * window.close(), which quit the app. The menu now emits "file:closeTab" and
 * the renderer closes one project tab; the last tab returns to welcome.
 */
await withEditorBrowser(async ({ page }) => {
  const settle = () => page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = () => page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const store = useDesignStore.getState();
    return {
      activeDocumentId: store.activeDocumentId,
      openDocuments: store.openDocuments.map((document) => document.id),
      welcomeOpen: store.welcomeOpen,
    };
  });

  await page.waitForFunction(() => typeof window.__menuAction === "function");
  const first = (await state()).activeDocumentId;
  await page.evaluate(async () => { const { useDesignStore } = await import("/src/store/design_store.js"); useDesignStore.getState().newVooProject({ label: "Second" }); });
  await settle();
  const second = (await state()).activeDocumentId;
  assert.ok(first && second && first !== second, "two project tabs must be open");

  await page.evaluate(() => window.__menuAction("file:closeTab"));
  await settle();
  let current = await state();
  assert.equal(current.activeDocumentId, first, "only the active tab closes and its neighbour takes over");
  assert.deepEqual(current.openDocuments, [first]);
  assert.equal(current.welcomeOpen, false);

  // A dirty tab respects the same confirmation as the tab-strip close button.
  await page.evaluate(async () => { const { useDesignStore } = await import("/src/store/design_store.js"); useDesignStore.getState().setIsDirty(true); });
  await page.evaluate(() => { window.confirm = () => false; });
  await page.evaluate(() => window.__menuAction("file:closeTab"));
  await settle();
  assert.deepEqual(await state(), { activeDocumentId: first, openDocuments: [first], welcomeOpen: false });

  await page.evaluate(() => { window.confirm = () => true; });
  await page.evaluate(() => window.__menuAction("file:closeTab"));
  await settle();
  current = await state();
  assert.equal(current.activeDocumentId, null, "closing the last tab returns to welcome");
  assert.deepEqual(current.openDocuments, []);
  assert.equal(current.welcomeOpen, true);
  assert.equal(await page.getByTestId("editor-top-bar").count(), 1, "the application window stays open");

  console.log("native close-tab menu action closes one tab, honours dirty confirmation and never quits");
}, {
  preparePage: async (page) => {
    await page.addInitScript(() => {
      window.electronAPI = {
        isElectron: true,
        platform: "linux",
        onMenuAction: (callback) => {
          window.__menuAction = callback;
          return () => { window.__menuAction = null; };
        },
      };
    });
  },
});
