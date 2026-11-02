import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const preload = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/store/project_io.js")));
  assert.equal(preload.length, 0, "Cold welcome must not preload project parsers");
  let delayedImports = 0;
  await page.route("**/src/canvas/store/project_io.js*", async (route) => {
    delayedImports += 1;
    // Chromium expires transient activation after five seconds. The picker
    // must already be open before this deliberately slow parser chunk arrives.
    await new Promise((resolve) => setTimeout(resolve, 6500));
    await route.continue();
  });
  await page.evaluate(async () => {
    const { openVooProject } = await import("/src/canvas/store/open-project.js");
    const trace = { loading: [], pickerCalls: 0 };
    window.__projectPickerTrace = trace;
    const envelope = {
      format: "voo-editor", version: 2, kind: "design", assets: {},
      document: { version: 2, width: 10, height: 10, nodes: [], pages: [] },
    };
    const file = new File([JSON.stringify(envelope)], "Picked.voo", { type: "application/json" });
    const handle = { kind: "file", name: file.name, getFile: async () => file };
    window.showOpenFilePicker = async () => {
      trace.pickerCalls += 1;
      trace.activation = navigator.userActivation.isActive;
      trace.parserRequestsAtPick = performance.getEntriesByType("resource")
        .filter((entry) => entry.name.includes("/store/project_io.js")).length;
      return [handle];
    };
    const store = {
      setDocumentLoading: (label) => trace.loading.push(label),
      loadVooProject: (opened) => {
        trace.loadedName = opened.fileName;
        trace.sameHandle = opened.fileHandle === handle;
        trace.loadedWidth = opened.vooData.document.width;
      },
    };
    const button = document.createElement("button");
    button.id = "project-picker-review";
    button.textContent = "Open test document";
    button.onclick = async () => {
      try { trace.result = await openVooProject({ store }); }
      catch (error) { trace.error = String(error); }
      trace.complete = true;
    };
    document.body.append(button);
  });
  await page.locator("#project-picker-review").click();
  await page.waitForFunction(() => window.__projectPickerTrace.complete, null, { timeout: 20000 });
  const trace = await page.evaluate(() => window.__projectPickerTrace);
  assert.equal(trace.error, undefined);
  assert.equal(delayedImports, 1, "Parser request was actually held behind a cold network boundary");
  assert.equal(trace.activation, true, "Native picker retains the real pointer click's user activation");
  assert.equal(trace.parserRequestsAtPick, 0);
  assert.equal(trace.pickerCalls, 1);
  assert.equal(trace.sameHandle, true, "The selected file handle must remain available to autosave");
  assert.equal(trace.loadedName, "Picked.voo");
  assert.equal(trace.loadedWidth, 10);
  assert.equal(trace.result.success, true);
  assert.equal(typeof trace.loading[0], "string");
  assert.equal(trace.loading.at(-1), null, "The document loading overlay must clear after parsing");
  console.log("PASS project picker: cold slow parser, real click activation, source handle, loading cleanup");
}, { openDocument: false, mcpLink: false });
