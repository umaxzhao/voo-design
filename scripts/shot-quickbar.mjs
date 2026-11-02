import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/workspace/wt-quickbar/package.json");
const { chromium } = require("playwright");

const url = process.env.URL || "http://127.0.0.1:5191/?voo-test=1";
const suffix = process.env.SUFFIX || "before";
const outDir = "/workspace/tmp";
fs.mkdirSync(outDir, { recursive: true });
const PNG1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH26AAAAAElFTkSuQmCC";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => localStorage.setItem("ciw.locale", "zh"));
const page = await context.newPage();
page.setDefaultTimeout(180000);

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__vooEditor && !!window.__vooStore, null, { timeout: 60000 });
await page.waitForTimeout(600);

// Dismiss welcome overlay so contextual bar is actually visible
await page.evaluate(() => {
  try {
    window.__vooStore?.setWelcomeOpen?.(false);
  } catch {}
  try {
    // If still open, create/focus a project
    const s = window.__vooStore;
    if (s?.welcomeOpen) s.newVooProject?.({ label: "Quickbar" });
    s?.setWelcomeOpen?.(false);
  } catch {}
});
await page.waitForTimeout(800);
// verify
const welcomeGone = await page.evaluate(() => {
  // re-read via action side-effect: close and check DOM
  window.__vooStore?.setWelcomeOpen?.(false);
  return !document.body.innerText.includes("从 Figma 导入");
});
console.log("welcomeGone", welcomeGone);
await page.waitForSelector('[data-testid="editor-bottom-toolbar"]', { timeout: 30000 });

async function shot(name) {
  await page.waitForTimeout(450);
  const bar = page.locator('[data-testid="editor-contextual-taskbar"]');
  await bar.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  const visible = await bar.isVisible().catch(() => false);
  const full = `${outDir}/quickbar-${suffix}-${name}-full.png`;
  const path = `${outDir}/quickbar-${suffix}-${name}.png`;
  await page.screenshot({ path: full, fullPage: false });
  if (visible) {
    const box = await bar.boundingBox();
    console.log(name, "box", box);
    // element screenshot (true paint of bar)
    await bar.screenshot({ path: `${outDir}/quickbar-${suffix}-${name}-el.png` }).catch(() => {});
    if (box) {
      const zoom = page.locator('[data-testid="editor-bottom-toolbar"]');
      const zb = await zoom.boundingBox().catch(() => null);
      const top = Math.max(0, Math.floor(Math.min(box.y, zb?.y ?? box.y) - 48));
      const bottom = Math.min(900, Math.ceil(Math.max(box.y + box.height, (zb ? zb.y + zb.height : box.y + box.height)) + 20));
      const left = Math.max(0, Math.floor(Math.min(box.x, zb?.x ?? box.x) - 48));
      const right = Math.min(1440, Math.ceil(Math.max(box.x + box.width, (zb ? zb.x + zb.width : box.x + box.width)) + 48));
      await page.screenshot({ path, clip: { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) } });
    } else {
      await page.screenshot({ path });
    }
  } else {
    await page.screenshot({ path });
  }
  const actions = visible
    ? await bar.evaluate((el) =>
        [...el.querySelectorAll("button")]
          .filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map((b) => ({
            label: b.getAttribute("aria-label") || "",
            testid: b.getAttribute("data-testid") || "",
          }))
      )
    : [];
  console.log(JSON.stringify({ name, visible, actions }));
  return { name, visible, actions, path };
}

const report = {};

report.shapeId = await page.evaluate(async () => {
  window.__vooStore?.setWelcomeOpen?.(false);
  const { executeCanvasTool } = await import("/src/canvas/agent/canvas_tools.js");
  const rect = await executeCanvasTool("create_shape", {
    kind: "rect", x: 200, y: 180, width: 260, height: 160, fill: "#6366F1", name: "Shape",
  });
  const id = rect?.id ?? rect?.layerId;
  window.__vooEditor.select(id);
  window.__vooEditor.getViewport?.()?.zoomToFit?.();
  return id;
});
report.shape = await shot("shape");

await page.evaluate(() => window.__vooEditor.select(null));
report.textId = await page.evaluate(async () => {
  let id = null;
  try {
    const { executeCanvasTool } = await import("/src/canvas/agent/canvas_tools.js");
    const text = await executeCanvasTool("create_shape", {
      kind: "text", x: 220, y: 240, text: "Hello VOO", fontSize: 48, fill: "#FFFFFF", name: "Title",
    });
    id = text?.id ?? text?.layerId;
  } catch {}
  if (!id) {
    const node = window.__vooEditor.addTextAt?.({ x: 220, y: 240 }, "Hello VOO");
    id = node?.id ?? node;
  }
  window.__vooEditor.select(id);
  window.__vooEditor.getViewport?.()?.zoomToFit?.();
  return id;
});
report.text = await shot("text");

await page.evaluate(() => window.__vooEditor.select(null));
report.imageId = await page.evaluate(async (PNG1) => {
  const node = await window.__vooEditor.insertImage(PNG1, { x: 240, y: 200 });
  const id = node?.id ?? node?.layerId ?? node;
  window.__vooEditor.select(id);
  window.__vooEditor.getViewport?.()?.zoomToFit?.();
  return id;
}, PNG1);
report.image = await shot("image");

await page.evaluate(() => window.__vooEditor.select(null));
report.frameId = await page.evaluate(async () => {
  const { executeCanvasTool } = await import("/src/canvas/agent/canvas_tools.js");
  let id = null;
  try {
    const frame = await executeCanvasTool("create_frame", { x: 180, y: 140, width: 360, height: 240, name: "Frame" });
    id = frame?.id ?? frame?.layerId ?? frame?.node?.id;
  } catch {
    const node = window.__vooEditor.addFrameAt?.({ x: 180, y: 140 });
    id = node?.id ?? node;
  }
  window.__vooEditor.select(id);
  window.__vooEditor.getViewport?.()?.zoomToFit?.();
  return id;
});
report.frame = await shot("frame");

await page.evaluate(() => window.__vooEditor.select(null));
report.groupId = await page.evaluate(async () => {
  const { executeCanvasTool } = await import("/src/canvas/agent/canvas_tools.js");
  const a = await executeCanvasTool("create_shape", { kind: "ellipse", x: 280, y: 280, width: 90, height: 90, fill: "#22C55E", name: "A" });
  const b = await executeCanvasTool("create_shape", { kind: "rect", x: 390, y: 300, width: 110, height: 70, fill: "#F59E0B", name: "B" });
  const idA = a?.id ?? a?.layerId;
  const idB = b?.id ?? b?.layerId;
  const g = await executeCanvasTool("group_layers", { layerIds: [idA, idB] });
  const gid = g?.id ?? g?.groupId ?? g?.layerId;
  if (gid) await executeCanvasTool("select_layers", { layerIds: [gid] });
  console.log("groupSel", JSON.stringify({ gid, sel: window.__vooEditor.getSelected?.()?.kind, ids: window.__vooEditor.getSelectedIds?.(), g }));
  window.__vooEditor.getViewport?.()?.zoomToFit?.();
  return gid || [idA, idB];
});
report.group = await shot("group");

await page.evaluate(() => window.__vooEditor.select(null));
report.multiId = await page.evaluate(async () => {
  const { executeCanvasTool } = await import("/src/canvas/agent/canvas_tools.js");
  const a = await executeCanvasTool("create_shape", { kind: "rect", x: 140, y: 380, width: 100, height: 80, fill: "#EC4899", name: "M1" });
  const b = await executeCanvasTool("create_shape", { kind: "rect", x: 280, y: 400, width: 100, height: 80, fill: "#06B6D4", name: "M2" });
  const idA = a?.id ?? a?.layerId;
  const idB = b?.id ?? b?.layerId;
  await executeCanvasTool("select_layers", { layerIds: [idA, idB] });
  const ids = window.__vooEditor.getSelectedIds?.() || [];
  return { idA, idB, selectedIds: ids, count: ids.length };
});
console.log("multi", report.multiId);
report.multi = await shot("multi");

fs.writeFileSync(`${outDir}/quickbar-${suffix}-report.json`, JSON.stringify(report, null, 2));
console.log("DONE");
await browser.close();
