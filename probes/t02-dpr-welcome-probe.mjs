import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "../tests/e2e/editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "../tests/e2e/ui-responsive-editor-helpers.mjs";

// Read-only T02 probe: DPR 2 full-window captures for the editor and Welcome in both themes,
// plus the top-left junction and a keyboard focus ring. It asserts nothing; the caller reads the JSON.
const EVIDENCE = process.env.T02_B_EVIDENCE;
if (!EVIDENCE) throw new Error("T02_B_EVIDENCE must name an evidence directory");
await mkdir(EVIDENCE, { recursive: true });

const results = [];
await withEditorBrowser(async ({ page }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 2, mobile: false });

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);

    for (const surface of ["editor", "welcome"]) {
      // The title-bar brand button toggles Welcome, as a user would.
      const onWelcome = (await page.locator(".editor-welcome-overlay").count()) > 0;
      if ((surface === "welcome") !== onWelcome) {
        await page.locator(".app-title-brand-row > button").first().click();
      }
      await settlePanels(page);
      const name = `dpr2-${surface}-${theme}`;
      await page.screenshot({ path: join(EVIDENCE, `${name}.png`) });
      const info = await page.evaluate(() => {
        const shell = document.querySelector('[data-testid="editor-shell"]');
        const main = document.querySelector("main.app-root-frame");
        const bar = document.querySelector(".app-title-bar");
        const s = shell ? getComputedStyle(shell) : null;
        const focusTarget = document.querySelector('[data-testid="editor-properties-panel"] [data-testid="editor-color-variable-create"]');
        return {
          mainBg: main ? getComputedStyle(main).backgroundImage.slice(0, 60) + " | " + getComputedStyle(main).backgroundColor : null,
          editorPage: main?.dataset.editorPage ?? null,
          shellRadius: s?.borderTopLeftRadius ?? null,
          shellBorder: s ? `${s.borderTopWidth} ${s.borderTopColor}` : null,
          shellRect: shell ? shell.getBoundingClientRect().toJSON() : null,
          barRect: bar ? bar.getBoundingClientRect().toJSON() : null,
          focusTargetPresent: Boolean(focusTarget),
        };
      });
      results.push({ name, ...info });
    }
    if ((await page.locator(".editor-welcome-overlay").count()) > 0) {
      await page.locator(".app-title-brand-row > button").first().click();
    }
    await settlePanels(page);
  }

  // Keyboard focus on a real panel control (editor, light), captured and measured in the same run.
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, "light");
  await page.getByTestId("editor-properties-panel").getByTestId("editor-color-variable-create").focus().catch(() => null);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await settlePanels(page);
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    const s = el ? getComputedStyle(el) : null;
    return { tag: el?.tagName ?? null, testid: el?.dataset?.testid ?? null, outline: s ? `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` : null, boxShadow: s?.boxShadow ?? null, rect: el ? el.getBoundingClientRect().toJSON() : null };
  });
  await page.screenshot({ path: join(EVIDENCE, "focus-editor-light.png") });
  results.push({ name: "focus-editor-light", focus });
}, { openDocument: true, mcpLink: true });

await writeFile(join(EVIDENCE, "probe.json"), JSON.stringify(results, null, 2));
console.log(`probe written: ${join(EVIDENCE, "probe.json")}`);
