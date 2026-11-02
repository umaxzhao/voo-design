import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 source-host check: launches this copy's own Electron main/preload with its own
// dist build and an isolated userData profile. Nothing outside the copy is read or written.
const root = fileURLToPath(new URL("../../", import.meta.url));
const evidence = process.env.T02_EVIDENCE;
assert.ok(evidence, "T02_EVIDENCE must name a new evidence directory outside the original trees");
await mkdir(evidence, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "voo-t02-host-"));
const entry = join(profile, "entry.cjs");
await writeFile(entry, `const {app}=require('electron');
app.setPath('userData',${JSON.stringify(join(profile, "profile"))});
app.setPath('documents',${JSON.stringify(join(profile, "documents"))});
require(${JSON.stringify(join(root, "electron/main.cjs"))});`);

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const sectionHeights = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="editor-properties-panel"] [data-inspector-section]')].map((section) => ({
  title: section.querySelector("span.overflow-hidden")?.textContent?.trim() ?? null,
  height: Math.round(section.getBoundingClientRect().height),
  border: getComputedStyle(section).borderTopWidth,
})));

const app = await electron.launch({ args: [entry], env: {
  ...process.env,
  VOO_USER_DATA_DIR: join(profile, "profile"),
  VOO_DOCUMENTS_ROOT: join(profile, "documents"),
  VOO_CLI_BRIDGE_PORT: String(await freePort()),
  VOO_DISABLE_UPDATES: "1",
} });
const result = { platform: process.platform, profile: "isolated", checks: {} };
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const newDocument = page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true });
  await newDocument.waitFor({ timeout: 120_000 });
  await newDocument.click();
  await page.waitForFunction(() => window.__vooEditor, null, { timeout: 120_000 });
  // The host may open a document with leftover nodes; clear them so the fixture starts from an empty canvas.
  await page.evaluate(() => {
    const editor = window.__vooEditor;
    const doc = editor.getDocument();
    editor.setDoc({ ...doc, nodes: [], modifiers: [] });
  });
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await settlePanels(page);

  const sections = await sectionHeights(page);
  result.checks.sections = sections;
  const byTitle = (name) => sections.find((section) => section.title === name);
  for (const name of ["Stroke", "Effects", "Export"]) {
    assert.equal(byTitle(name)?.height, 41, `${name} empty group must be header-only (41px)`);
  }
  assert.ok(byTitle("Transform")?.height > 41, "Transform default-open body must be visible");

  const cross = await page.getByTestId("editor-constraints-diagram").boundingBox();
  const vertical = await page.getByTestId("editor-constraints-center-vertical").locator("span[aria-hidden='true']").boundingBox();
  const horizontal = await page.getByTestId("editor-constraints-center-horizontal").locator("span[aria-hidden='true']").boundingBox();
  const diffX = (vertical.x + vertical.width / 2) - (cross.x + cross.width / 2);
  const diffY = (horizontal.y + horizontal.height / 2) - (cross.y + cross.height / 2);
  result.checks.cross = { diffX: Number(diffX.toFixed(2)), diffY: Number(diffY.toFixed(2)) };
  assert.ok(Math.abs(diffX) < 0.5 && Math.abs(diffY) < 0.5, `centre cross must be continuous: ${JSON.stringify(result.checks.cross)}`);

  await page.getByTestId("editor-constraints-left").focus();
  let reached = false;
  for (let step = 0; step < 40 && !reached; step += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "editor-constraints-center-vertical");
  }
  assert.ok(reached, "Tab must reach the centre-vertical pin");
  result.checks.tabReached = reached;

  await page.getByTestId("editor-modifiers-add").getByRole("button").click();
  const pick = page.locator('[data-testid^="editor-modifier-add-"]:not([disabled])').first();
  await pick.waitFor();
  await pick.click();
  await page.getByTestId("editor-modifier-row").waitFor();
  await page.keyboard.press("ControlOrMeta+Z");
  await settlePanels(page);
  const afterUndo = await page.evaluate(() => (window.__vooEditor.getDocument().modifiers ?? []).length);
  assert.equal(afterUndo, 0, "one Undo removes the modifier added from the host");
  result.checks.modifierUndo = afterUndo;

  await page.screenshot({ path: join(evidence, "electron-host-properties.png") });
  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.error = String(error?.message ?? error);
  throw error;
} finally {
  await writeFile(join(evidence, "electron-host-result.json"), JSON.stringify(result, null, 2));
  await app.close();
  console.log(JSON.stringify(result.status === "passed" ? { status: "passed", checks: Object.keys(result.checks) } : result));
}
