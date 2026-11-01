import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { assertEmptyCanvas, verifyEmptyCanvasImports } from "./empty-canvas-checks.mjs";

// Hold the lazy dashboard so New is clicked before its effect can subscribe.
let releaseWelcome;
let sawWelcome;
const delayedWelcome = new Promise(resolve => { releaseWelcome = resolve; });
const requestedWelcome = new Promise(resolve => { sawWelcome = resolve; });
await withEditorBrowser(async ({ page, errors }) => {
  await Promise.race([requestedWelcome, new Promise((_, reject) => setTimeout(() => reject(new Error("Welcome module was not requested")), 15000))]);
  const original = await page.evaluate(async () => {
    const { workspaceStorage } = await import("/src/services/workspace_storage.js");
    const { createDocument } = await import("/src/canvas/editor/scene_doc_factory.js");
    const { emptyVooFile } = await import("/electron/voo_format.js");
    const bytes = new TextEncoder().encode(JSON.stringify(emptyVooFile(createDocument(123, 456))));
    const saved = await workspaceStorage.writeFileBytes("Design1.voo", bytes, { category: "web" });
    return { id: saved.id ?? saved.path ?? saved.name, bytes: [...bytes] };
  });
  await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
  assert.equal(await page.evaluate(() => Boolean(window.__vooEditor)), false);
  releaseWelcome();
  await page.waitForFunction(() => window.__vooEditor && !window.__vooStore.welcomeOpen, null, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.__vooStore.openDocuments.length), 1);
  assert.equal(await page.evaluate(() => window.__vooStore.fileName), "Design2.voo");
  await assertEmptyCanvas(page);
  const retained = await page.evaluate(async id => {
    const { workspaceStorage } = await import("/src/services/workspace_storage.js");
    return [...await workspaceStorage.readFileBytes(id)];
  }, original.id);
  assert.deepEqual(retained, original.bytes, "Cold New must not replace the existing workspace file");
  assert.deepEqual(errors, []);
  console.log("Title bar: New requested before lazy welcome subscription creates exactly one document.");
}, { openDocument: false, mcpLink: false, preparePage: async page => {
  await page.route("**/src/canvas/components/welcome_dashboard.jsx*", async route => {
    sawWelcome();
    await delayedWelcome;
    await route.continue();
  });
} });

let releaseWelcomeActions;
const welcomeActionsGate = new Promise(resolve => { releaseWelcomeActions = resolve; });

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
    try {
      assert.equal(await openButton().isDisabled(), true, "Import waits for the welcome action listeners");
      assert.equal(await bar.getByRole("button", { name: "New", exact: true }).isDisabled(), false);
    } finally { releaseWelcomeActions(); }
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
    await assertEmptyCanvas(page);
    assert.equal(
      await page.evaluate(() => window.__vooStore.fileName),
      "TitlebarAudit.voo",
    );
    const shareTrigger = bar.getByRole("button", { name: "Share", exact: true });
    await shareTrigger.click();
    // Global popovers are portaled outside the title bar to stay above canvas.
    const shareDialog = page.getByRole("dialog", { name: "Share", exact: true });
    await shareDialog.waitFor({ state: "visible" });
    const shareBounds = await shareDialog.boundingBox();
    assert.ok(shareBounds, "the share dialog should have a visible box");
    const shareDialogIsTopmost = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit?.closest('[role="dialog"][aria-label="Share"]'));
    }, {
      x: shareBounds.x + shareBounds.width / 2,
      y: shareBounds.y + shareBounds.height / 2,
    });
    assert.equal(shareDialogIsTopmost, true, "the canvas must not cover the share dialog");
    await shareTrigger.click();
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
    await assertEmptyCanvas(page);
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
    await assertEmptyCanvas(page);
    await verifyEmptyCanvasImports(page);
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
  { openDocument: false, mcpLink: false, preparePage: async page => {
    await page.route("**/src/canvas/components/welcome_dashboard.jsx*", async route => {
      await welcomeActionsGate;
      await route.continue();
    });
  } },
);
