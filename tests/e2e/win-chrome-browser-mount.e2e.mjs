/**
 * WIN-CHROME-01 Browser Real Mount Regression Verification
 *
 * SCOPE:
 * - Real Chromium browser instance launched via Playwright.
 * - Real React 18 DOM tree mount of <App /> and <AppTitleBar />.
 * - Verifies that App's useEffect mounts the real window 'keydown' listener.
 * - Dispatches browser KeyboardEvents covering:
 *   1) isComposing = true (IME composition guard) -> defaultPrevented: false, 0 documents created
 *   2) keyCode = 229 (IME keycode guard) -> defaultPrevented: false, 0 documents created
 *   3) defaultPrevented = true (pre-consumed guard) -> 0 documents created
 *   4) Valid Ctrl+N -> defaultPrevented: true, exactly 1 document created
 *
 * EXPLICIT SIMULATION NOTICE:
 * - This verifies Chromium browser DOM-level event routing and React 18 lifecycle.
 * - This is explicitly a browser-level simulation, NOT a Windows OS native DWM or physical OS IME engine proof.
 */

import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

console.log("[win-chrome-browser-mount] Starting real browser DOM mount test in Chromium...");

await withEditorBrowser(
  async ({ page, errors }) => {
    page.setDefaultTimeout(20000);

    // 1. Verify real ReactDOM mount of titlebar and welcome dashboard
    const bar = page.getByTestId("editor-top-bar");
    await bar.waitFor({ state: "visible" });
    const welcome = page.locator(".welcome-dashboard");
    await welcome.waitFor({ state: "visible" });

    // Verify store is initialized in welcome state (preload store for synchronous polling)
    await page.evaluate(async () => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      window.__useDesignStore = useDesignStore;
    });
    const isWelcome = await page.evaluate(() => {
      return Boolean(window.__useDesignStore.getState().welcomeOpen);
    });
    assert.equal(isWelcome, true, "Real browser initial state must be welcomeOpen === true");
    assert.equal(await page.evaluate(() => Boolean(window.__vooEditor)), false, "Editor must not be initialized yet");

    // 2. Test Guard 1: IME in-progress (isComposing = true)
    const composingResult = await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", {
        key: "n",
        code: "KeyN",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      // Emulate IME composition property
      Object.defineProperty(event, "isComposing", { value: true, configurable: true });
      window.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented, editorActive: Boolean(window.__vooEditor) };
    });
    assert.equal(composingResult.defaultPrevented, false, "IME isComposing=true must not call preventDefault");
    assert.equal(composingResult.editorActive, false, "IME isComposing=true must not trigger document creation");

    // 3. Test Guard 2: IME key code 229 (Windows/Chromium composition keyCode)
    const imeCodeResult = await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", {
        key: "n",
        code: "KeyN",
        ctrlKey: true,
        keyCode: 229,
        which: 229,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented, editorActive: Boolean(window.__vooEditor) };
    });
    assert.equal(imeCodeResult.defaultPrevented, false, "IME keyCode=229 must not call preventDefault");
    assert.equal(imeCodeResult.editorActive, false, "IME keyCode=229 must not trigger document creation");

    // 4. Test Guard 3: defaultPrevented = true (already handled)
    const prePreventedResult = await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", {
        key: "n",
        code: "KeyN",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault(); // Pre-consume
      window.dispatchEvent(event);
      return { editorActive: Boolean(window.__vooEditor) };
    });
    assert.equal(prePreventedResult.editorActive, false, "defaultPrevented=true must not trigger document creation");

    // 5. Test Valid Action: standard Ctrl+N
    const validResult = await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", {
        key: "n",
        code: "KeyN",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented };
    });
    assert.equal(validResult.defaultPrevented, true, "Valid Ctrl+N must prevent browser default");

    // Wait for the document creation to finish and editor to mount
    await page.waitForFunction(
      () => Boolean(window.__vooEditor && !window.__useDesignStore.getState().welcomeOpen),
      null,
      { timeout: 30000 }
    );

    const docsCount = await page.evaluate(() => {
      return window.__useDesignStore.getState().openDocuments.length;
    });
    assert.equal(docsCount, 1, "Exactly one document must be created by Ctrl+N");

    // Zero page errors during the entire sequence
    assert.deepEqual(errors, []);

    console.log("PASS: Real browser ReactDOM mount, Ctrl+N routing, IME guards, and preventDefault passed.");
  },
  { openDocument: false, mcpLink: false }
);
