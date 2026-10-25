import { chromium } from "playwright";
import fs from "node:fs";

const OUT = process.env.VOO_AUDIT_OUT ?? "/tmp/voo-design-audit";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") pageErrors.push("console: " + m.text().slice(0, 200));
});

const states = {};

const sleep = (ms) => page.waitForTimeout(ms);
const drag = async (a, b, c, d) => {
  await page.mouse.move(a, b);
  await page.mouse.down();
  await page.mouse.move(c, d, { steps: 10 });
  await page.mouse.up();
};
const toolButton = (label) =>
  page.locator(`[data-testid="editor-toolbar"] button[aria-label="${label}"]`);
const menuPick = async (family, key) => {
  await page.locator(`[data-testid="editor-${family}-menu-trigger"]`).click();
  await sleep(180);
  await page.locator(`[data-testid="editor-${family}-menu-${key}"]`).click();
  await sleep(280);
};
const pressKey = async (key) => {
  await page.mouse.move(900, 780);
  await page.keyboard.press(key);
  await sleep(260);
};

const CAPTURE = `(() => {
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const rect = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const panel = [...document.querySelectorAll('[data-testid="editor-properties-panel"]')].filter(visible)[0] ?? null;
  const layers = [...document.querySelectorAll('[data-testid="editor-layers-panel"]')].filter(visible)[0] ?? null;
  const toolbar = [...document.querySelectorAll('[data-testid="editor-toolbar"]')].filter(visible)[0] ?? null;
  const scope = panel ?? layers ?? document.body;

  // clipped leaf text inside the inspected panel
  const clipped = [];
  for (const el of scope.querySelectorAll("*")) {
    if (el.children.length) continue;
    const s = getComputedStyle(el);
    if (s.overflow === "visible") continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      clipped.push({ text: (el.innerText || el.textContent || "").trim().slice(0, 40), w: el.clientWidth, sw: el.scrollWidth });
    }
  }

  // controls inventory
  const controls = [...scope.querySelectorAll("button, input, select, [role=switch], [role=slider]")].map((el) => ({
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("role") || null,
    label: el.getAttribute("aria-label") || el.getAttribute("title") || null,
    pressed: el.getAttribute("aria-pressed"),
    checked: el.getAttribute("aria-checked"),
    value: el.tagName === "INPUT" || el.tagName === "SELECT" ? (el.type === "checkbox" ? String(el.checked) : String(el.value)) : null,
    disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
    box: rect(el),
  }));

  // buttons without an accessible name
  const unnamed = [...scope.querySelectorAll("button")].filter((el) => {
    const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || "").trim();
    return !name;
  }).map((el) => ({ box: rect(el), cls: (el.className || "").toString().slice(0, 60) }));

  // small targets
  const small = [...scope.querySelectorAll("button, [role=switch]")].map((el) => ({ box: rect(el), label: el.getAttribute("aria-label") || (el.innerText || "").trim().slice(0, 20) })).filter((c) => c.box[2] < 24 || c.box[3] < 24);

  // raw i18n keys leaking into the UI
  const text = scope.innerText || "";
  const attrs = [...scope.querySelectorAll("*")].map((el) => (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "") + " " + (el.getAttribute("placeholder") || "")).join(" ");
  const keyRegex = /(?:editor|welcome|agent|settings|menu|common|app|canvas|penImport|figmaImport)\\.[a-zA-Z0-9_.]+/g;
  const rawKeys = [...new Set((text + " " + attrs).match(keyRegex) || [])];

  // low-contrast leaf text (WCAG-ish ratio against the nearest opaque background)
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(",").map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const bg = parse(getComputedStyle(n).backgroundColor); if (bg && bg.a > 0.5) return bg; n = n.parentElement; } return { r: 10, g: 10, b: 10, a: 1 }; };
  const lowContrast = [];
  for (const el of scope.querySelectorAll("*")) {
    const direct = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!direct) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const fg = parse(getComputedStyle(el).color);
    if (!fg) continue;
    const ratio = contrast(fg, bgOf(el));
    const size = parseFloat(getComputedStyle(el).fontSize) || 12;
    if (ratio < (size >= 18 ? 3 : 4.5)) lowContrast.push({ text: direct.slice(0, 30), ratio: Math.round(ratio * 100) / 100, size });
  }

  // section heading order (panel): 9px uppercase micro labels
  const sectionTitles = [];
  for (const el of scope.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    const t = (el.innerText || "").trim();
    if (!t || t.length > 32 || el.children.length > 0) continue;
    if (s.fontSize === "9px" && s.textTransform === "uppercase") sectionTitles.push(t);
  }

  const scroll = scope.querySelector('[class*="overflow-y"]') ?? scope;
  return {
    panel: panel ? { box: rect(panel), text: panel.innerText.replace(/\\n+/g, " | ").slice(0, 1500), scrollH: panel.scrollHeight, clientH: panel.clientHeight } : null,
    layersText: layers ? layers.innerText.replace(/\\n+/g, " | ").slice(0, 400) : null,
    toolbarButtons: toolbar ? [...toolbar.querySelectorAll("button")].map((b) => (b.getAttribute("aria-label") || "").trim()) : null,
    clipped, controls, unnamed, small, rawKeys, lowContrast: lowContrast.slice(0, 12), sectionTitles,
    doc: { scrollH: scroll.scrollHeight, clientH: scroll.clientHeight },
  };
})()`;

async function capture(name) {
  await sleep(450);
  let info = null;
  try {
    info = await page.evaluate(CAPTURE);
  } catch (error) {
    info = { error: String(error).slice(0, 200) };
  }
  states[name] = info;
  try {
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (info?.panel?.box) {
      const [x, y, w, h] = info.panel.box;
      await page.screenshot({ path: `${OUT}/${name}-panel.png`, clip: { x: Math.max(0, x - 4), y: Math.max(0, y - 4), width: Math.min(w + 8, 1440 - x), height: Math.min(h + 8, 900 - y) } });
    }
  } catch (error) {
    states[name].shotError = String(error).slice(0, 120);
  }
  console.log("captured", name);
}

// ---- scene ----
await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
await sleep(2500);
await page.getByRole("button", { name: /^New$/ }).first().click();
await sleep(2200);

await capture("01-select-nothing");

// rectangle
await menuPick("shapes", "rect");
await drag(400, 320, 520, 420);
await sleep(500);
await pressKey("v");
await capture("02-select-rect");

// text
await toolButton("Text").click();
await sleep(200);
await page.mouse.click(620, 500);
await sleep(500);
await page.keyboard.type("Hello");
await page.keyboard.press("Escape");
await sleep(500);
await capture("03-select-text");

// paint layer
await menuPick("brush", "normal");
await drag(700, 600, 820, 600);
await sleep(500);
await pressKey("v");
await page.mouse.click(760, 600);
await sleep(500);
await capture("04-select-paint");

// frame
await toolButton("Frame").click();
await sleep(200);
await drag(880, 320, 1000, 430);
await sleep(500);
await pressKey("v");
await page.mouse.click(940, 400);
await sleep(500);
await capture("05-select-frame");

// multi-select: rect then shift+text
await page.mouse.click(460, 370);
await sleep(250);
await page.keyboard.down("Shift");
await page.mouse.click(640, 500);
await page.keyboard.up("Shift");
await sleep(400);
await capture("06-multi-select");

// ---- tool states ----
await pressKey("v");
const toolStates = [];
for (const [family, keys] of [
  ["select", ["select", "distort", "perspective", "puppet"]],
  ["marquee", ["rect", "ellipse", "wand", "region", "lasso", "poly", "magnetic"]],
  ["brush", ["normal", "smudge", "blur", "sharpen", "dodge", "burn", "sponge"]],
  ["healing", ["aiRepair", "spot", "patch", "clone"]],
  ["pen", ["pen", "curvature_pen", "free_pen"]],
  ["shapes", ["rect", "ellipse", "line", "polygon", "star", "arrow"]],
  ["fill", ["fill", "gradient"]],
]) {
  for (const key of keys) {
    await menuPick(family, key);
    await sleep(350);
    const name = `tool-${family}-${key}`.replace(/_/g, "-");
    toolStates.push(name);
    await capture(name);
  }
}
for (const [label, key] of [["Crop", "crop"], ["Text", "text"], ["Eraser", "eraser"], ["Eyedropper", "dropper"], ["Hand", "hand"]]) {
  const btn = toolButton(label);
  if (await btn.count()) {
    await btn.click();
    await sleep(300);
    await capture(`tool-${key}`);
  }
}
await pressKey("v");

fs.writeFileSync(`${OUT}/out.json`, JSON.stringify({ states, pageErrors }, null, 1));
console.log("STATES", Object.keys(states).length, "ERRS", JSON.stringify(pageErrors.slice(0, 10)));
await browser.close();
