import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(
  async ({ page, errors }) => {
    page.setDefaultTimeout(15000);
    const bar = page.getByTestId("editor-top-bar");
    const home = page.locator(".welcome-dashboard");
    const ready = () =>
      page.waitForFunction(
        () =>
          window.__vooEditor &&
          !window.__vooStore?.welcomeOpen &&
          document
            .querySelector('[data-testid="design-editor"] [data-open-guard]')
            ?.getAttribute("data-open-guard") === "off",
      );
    const openButton = () =>
      bar.getByRole("button", {
        name: "Import project file (⌘O / Ctrl+O)",
        exact: true,
      });
    const pick = async (file) => {
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        openButton().click(),
      ]);
      if (file) await chooser.setFiles(file);
      else await chooser.setFiles([]);
      return chooser;
    };
    await home.waitFor();
    assert.equal(
      await page.getByTestId("mobile-project-switcher").isVisible(),
      false,
    );
    assert.equal(await page.evaluate(() => Boolean(window.__vooEditor)), false);
    for (const button of await bar
      .locator("button.app-title-desktop-action")
      .all()) {
      assert.equal(await button.locator("svg").count(), 0);
      const bounds = await button.boundingBox();
      assert.ok(
        bounds.height <= 32 && bounds.y >= 0 && bounds.y + bounds.height <= 40,
      );
    }
    await pick(null);
    assert.ok(await home.isVisible());
    const serialized = await page.evaluate(async () => {
      const { createDocument } = await import(
        "/src/canvas/editor/scene_doc_factory.js"
      );
      const { emptyVooFile } = await import("/electron/voo_format.js");
      return JSON.stringify(
        emptyVooFile(
          createDocument(640, 480, "#171717", { canvasId: "titlebar-audit" }),
        ),
      );
    });
    await pick({
      name: "TitlebarAudit.voo",
      mimeType: "application/json",
      buffer: Buffer.from(serialized),
    });
    await ready();
    assert.equal(
      await page.evaluate(() => window.__vooStore.fileName),
      "TitlebarAudit.voo",
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      bar
        .getByRole("button", {
          name: "Export project as a portable .zip snapshot",
          exact: true,
        })
        .click(),
    ]);
    assert.match(download.suggestedFilename(), /\.zip$/);
    const bytes = await readFile(await download.path());
    assert.ok(bytes.length > 100);
    await bar.getByRole("button", { name: "VOO Design", exact: true }).click();
    await home.waitFor();
    const zip = {
      name: "Roundtrip.zip",
      mimeType: "application/zip",
      buffer: bytes,
    };
    const chooser = await pick(zip);
    assert.match(await chooser.element().getAttribute("accept"), /\.zip/);
    await ready();
    assert.equal(
      await page.evaluate(() => window.__vooEditor.getDocument().width),
      640,
    );
    await bar.getByRole("button", { name: "VOO Design", exact: true }).click();
    await home.waitFor();
    const previousDocumentId = await page.evaluate(() => window.__vooStore.activeDocumentId);
    await bar.getByRole("button", { name: "New", exact: true }).click();
    // The old editor remains mounted while the new project is being created.
    // Wait for document identity, not an old engine that already passes ready().
    await page.waitForFunction(id => window.__vooStore.activeDocumentId !== id, previousDocumentId);
    await ready();
    assert.match(
      await page.evaluate(() => window.__vooStore.fileName),
      /^Design/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/voo-titlebar-narrow.png" });
    assert.equal(
      await page.getByTestId("mobile-project-switcher").isVisible(),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Title bar: cold-start layout, cancelled import, file import, snapshot export/import, new document and narrow navigation passed.",
    );
  },
  { openDocument: false, mcpLink: false },
);
