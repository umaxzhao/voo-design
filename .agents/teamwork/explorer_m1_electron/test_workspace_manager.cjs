const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert");

// Point VOO_USER_DATA_DIR and VOO_DOCUMENTS_ROOT to scratch dir
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "voo-test-workspace-"));
process.env.VOO_USER_DATA_DIR = path.join(scratch, "userData");
process.env.VOO_DOCUMENTS_ROOT = path.join(scratch, "Documents");

fs.mkdirSync(process.env.VOO_USER_DATA_DIR, { recursive: true });
fs.mkdirSync(process.env.VOO_DOCUMENTS_ROOT, { recursive: true });

const wm = require("./proposed_workspace_manager.cjs");

console.log("Testing proposed_workspace_manager.cjs...");

(async () => {
  // 1. Initial config should be default
  const initialConfig = wm.getWorkspaceConfig();
  assert.strictEqual(initialConfig.type, "electron");
  assert.strictEqual(initialConfig.isDefault, true);
  assert.strictEqual(initialConfig.isConfigured, false);
  assert(initialConfig.path.includes("VOO/Projects") || initialConfig.path.includes("VOO\\Projects"));
  console.log("✓ Default config test passed");

  // 2. Set new workspace directory
  const customWorkspace = path.join(scratch, "MyCustomWorkspace");
  fs.mkdirSync(customWorkspace, { recursive: true });
  const setRes = wm.setWorkspaceRootDir(customWorkspace);
  assert.strictEqual(setRes.ok, true);
  assert.strictEqual(setRes.path, customWorkspace);
  assert.strictEqual(setRes.config.isConfigured, true);

  const updatedConfig = wm.getWorkspaceConfig();
  assert.strictEqual(updatedConfig.isConfigured, true);
  assert.strictEqual(updatedConfig.path, customWorkspace);
  console.log("✓ Set directory test passed");

  // 3. Write files
  const r1 = await wm.writeWorkspaceFileBytes(customWorkspace, "Poster.voo", Buffer.from("test-voo-content"));
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.file.name, "Poster.voo");
  assert.strictEqual(r1.file.extension, "voo");
  assert.strictEqual(fs.existsSync(r1.file.path), true);

  const r2 = await wm.writeWorkspaceFileBytes(customWorkspace, "Icon.svg", "<svg></svg>");
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.file.extension, "svg");

  const r3 = await wm.writeWorkspaceFileBytes(customWorkspace, "Design.fig", Buffer.from([1, 2, 3]));
  assert.strictEqual(r3.ok, true);
  assert.strictEqual(r3.file.extension, "fig");

  const r4 = await wm.writeWorkspaceFileBytes(customWorkspace, "Mock.psd", Buffer.from([4, 5, 6]));
  assert.strictEqual(r4.ok, true);
  assert.strictEqual(r4.file.extension, "psd");

  // Non-matching file should be ignored by scanner
  fs.writeFileSync(path.join(customWorkspace, "notes.txt"), "hello");
  fs.writeFileSync(path.join(customWorkspace, ".hidden.voo"), "hidden");

  // 4. Scan files
  const scan = wm.scanWorkspaceFiles(customWorkspace);
  assert.strictEqual(scan.ok, true);
  assert.strictEqual(scan.files.length, 4);
  const names = scan.files.map((f) => f.name).sort();
  assert.deepStrictEqual(names, ["Design.fig", "Icon.svg", "Mock.psd", "Poster.voo"]);
  console.log("✓ Scanning test passed");

  // 5. Collision handling during write
  const collisionWrite = await wm.writeWorkspaceFileBytes(customWorkspace, "Poster.voo", Buffer.from("version2"), { overwrite: false });
  assert.strictEqual(collisionWrite.ok, true);
  assert.strictEqual(collisionWrite.file.name, "Poster-2.voo");
  console.log("✓ Write collision test passed");

  // 6. Case-only rename (APFS / Windows safety)
  const caseRename = wm.renameWorkspaceFile(r1.file.path, "poster.voo");
  assert.strictEqual(caseRename.ok, true);
  assert.strictEqual(caseRename.newName, "poster.voo");
  assert.strictEqual(fs.existsSync(caseRename.newPath), true);
  console.log("✓ Case-only rename test passed");

  // 7. Collision rename
  const collisionRename = wm.renameWorkspaceFile(caseRename.newPath, "Icon.svg");
  assert.strictEqual(collisionRename.ok, true);
  assert.strictEqual(collisionRename.collisionResolved, true);
  assert.strictEqual(collisionRename.newName, "Icon-2.svg");
  console.log("✓ Rename collision resolution test passed");

  // 8. Move to trash fallback
  const trashRes = await wm.moveFileToTrash(collisionRename.newPath, customWorkspace);
  assert.strictEqual(trashRes.ok, true);
  assert.strictEqual(fs.existsSync(collisionRename.newPath), false);
  console.log("✓ Move to trash fallback test passed");

  // 9. Delete permanently
  const toDelete = path.join(customWorkspace, "Design.fig");
  const deleteRes = await wm.deleteFilePermanently(toDelete);
  assert.strictEqual(deleteRes.ok, true);
  assert.strictEqual(fs.existsSync(toDelete), false);
  console.log("✓ Delete permanently test passed");

  // Cleanup scratch
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch {}

  console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
})();
