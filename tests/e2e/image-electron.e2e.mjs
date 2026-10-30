import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const profile = await mkdtemp("/private/tmp/voo-image-electron-");
await mkdir(`${profile}/documents`);
const entry = `${profile}/entry.cjs`;
await writeFile(entry, `const {app}=require('electron');app.setPath('userData',${JSON.stringify(`${profile}/profile`)});app.setPath('documents',${JSON.stringify(`${profile}/documents`)});app.setAppLogsPath(${JSON.stringify(`${profile}/logs`)});require(${JSON.stringify(`${root}electron/main.cjs`)});`);
const server = await startEditorBrowserServer();
let app;
try {
  app = await electron.launch({
    args: [entry],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: `${profile}/config`,
      XDG_CACHE_HOME: `${profile}/cache`,
      VOO_USER_DATA_DIR: `${profile}/profile`,
      VOO_DOCUMENTS_ROOT: `${profile}/documents`,
      VOO_CLI_BRIDGE_PORT: String(server.bridge.port),
      VOO_DISABLE_UPDATES: "1",
      VITE_DEV_SERVER_URL: `${server.origin}/?voo-test=1`
    }
  });
  assert.equal(await app.evaluate(({
    app
  }) => app.getPath("userData")), `${profile}/profile`);
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.waitForLoadState("networkidle");
  const config = await page.evaluate(() => window.electronAPI.workspace.getConfig());
  assert.ok(config.path.startsWith(`${profile}/documents/`), "Native test must never use the user's workspace");
  assert.equal(await page.evaluate(() => Boolean(window.electronAPI?.isElectron)), true);
  await page.getByTestId("editor-top-bar").getByRole("button", {
    name: "New",
    exact: true
  }).click();
  await page.waitForFunction(() => window.__vooEditor && document.querySelector('[data-open-guard="off"]'));
  const audit = imageAudit(page, "electron");
  let saved;
  await audit.record("native-image-render-edit-history", async () => {
    const image = await audit.seed();
    const before = await audit.pixels(image.id);
    await page.evaluate(id => window.__vooEditor.updateNode(id, {
      opacity: 0.5
    }), image.id);
    assert.notDeepEqual(await audit.pixels(image.id), before);
    await page.evaluate(() => window.__vooEditor.undo());
    assert.deepEqual(await audit.pixels(image.id), before);
    return {
      preload: true,
      actualPixels: true,
      undo: true
    };
  });
  await audit.record("native-project-write-reopen", async () => {
    saved = await page.evaluate(async () => {
      const {
        buildVooFile
      } = await import("/src/canvas/store/project_io.js");
      const {
        encodeVooBinary,
        decodeVooBinary
      } = await import("/src/canvas/store/voo_binary.js");
      const {
        workspaceStorage
      } = await import("/src/services/workspace_storage.js");
      const file = await buildVooFile({
        document: window.__vooEditor.serialise(),
        kind: "design",
        version: 2
      });
      const saved = await workspaceStorage.writeFileBytes("NativeAudit.voo", encodeVooBinary(file));
      const reopened = decodeVooBinary(await workspaceStorage.readFileBytes(saved.path));
      if (JSON.stringify(reopened.document) !== JSON.stringify(file.document)) throw new Error("NATIVE_PROJECT_MISMATCH");
      if (!Object.keys(reopened.assets).length) throw new Error("NATIVE_IMAGE_ASSETS_MISSING");
      return {
        id: saved.id,
        path: saved.path,
        name: saved.name
      };
    });
    assert.ok(saved.path.startsWith(config.path));
    return {
      physicalFile: true,
      binaryRoundTrip: true,
      imageAssets: true
    };
  });
  await audit.record("native-folder-move-rename", async () => {
    const result = await page.evaluate(async saved => {
      const {
        workspaceStorage: workspace
      } = await import("/src/services/workspace_storage.js");
      const folder = await workspace.createFolder("AuditProject");
      if (!folder.ok) throw new Error(folder.error);
      const moved = await workspace.moveToFolder(saved.path, "AuditProject");
      if (!moved.ok) throw new Error(moved.error);
      const renamed = await workspace.renameFile(moved.file.path, "RenamedAudit.voo");
      if (!renamed.ok) throw new Error(renamed.error);
      return {
        id: renamed.newPath,
        path: renamed.newPath,
        name: renamed.newName
      };
    }, saved);
    saved = result;
    assert.ok(saved.path.includes("/AuditProject/"));
    assert.equal(saved.name, "RenamedAudit.voo");
    return {
      nativeFolders: true,
      atomicMove: true,
      rename: true
    };
  });
  await audit.record("native-trash-list-restore", async () => {
    const result = await page.evaluate(async saved => {
      const {
        workspaceStorage: workspace
      } = await import("/src/services/workspace_storage.js");
      const removed = await workspace.moveToTrash(saved.path);
      if (!removed.ok) throw new Error(removed.error);
      const listed = await workspace.scanFiles({
        trashOnly: true
      });
      const item = listed.find(item => item.id === saved.id);
      if (!item) throw new Error("NATIVE_TRASH_NOT_LISTED");
      const bytes = await workspace.readFileBytes(item.path);
      const restored = await workspace.restoreFromTrash(saved.id);
      if (!restored.ok) throw new Error(restored.error);
      const after = await workspace.readFileBytes(saved.path);
      return {
        sameBytes: bytes.length === after.length && bytes.every((value, index) => value === after[index]),
        path: restored.path
      };
    }, saved);
    assert.equal(result.sameBytes, true);
    assert.equal(result.path, saved.path);
    return {
      visibleInAppTrash: true,
      originalFolder: true,
      sameBytes: true
    };
  });
  await audit.record("bundled-client-upscale-models", async () => {
    const loaded = await page.evaluate(async () => {
      const {
        UPSCALE_MODELS
      } = await import("/src/canvas/editor/upscale_models.js");
      const result = [];
      for (const model of UPSCALE_MODELS) {
        const bytes = await window.electronAPI.loadModelBytes(model.filename);
        if (bytes?.byteLength !== model.bytes) throw new Error(`Bundled model missing: ${model.filename}`);
        result.push({
          file: model.filename,
          bytes: bytes.byteLength
        });
      }
      return result;
    });
    return {
      nativeIpc: true,
      localFiles: true,
      downloads: 0,
      loaded
    };
  });
  await page.screenshot({
    path: `${process.env.VOO_IMAGE_AUDIT_DIR ?? "/private/tmp/voo-image-complete"}/electron-final.png`
  });
  audit.finish();
  assert.deepEqual(errors, []);
} finally {
  if (app) await app.close();
  await server.close();
}
