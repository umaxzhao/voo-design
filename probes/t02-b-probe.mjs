import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "../tests/e2e/editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "../tests/e2e/ui-responsive-editor-helpers.mjs";

// Read-only DOM probe for T02. It records what the browser renders (frame gaps, headings and
// their ancestor chain, hairline dividers, bordered controls, default-open bodies). It asserts nothing.
const EVIDENCE = process.env.T02_B_EVIDENCE;
if (!EVIDENCE) throw new Error("T02_B_EVIDENCE must name an evidence directory");
await mkdir(EVIDENCE, { recursive: true });

const VIEWPORTS = [
  { name: "wide-1440", width: 1440, height: 1000 },
  { name: "narrow-1100", width: 1100, height: 800 },
];
const THEMES = ["light", "dark"];

const probe = (page) => page.evaluate(() => {
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const borders = (el) => { const s = getComputedStyle(el); return { top: s.borderTopWidth, right: s.borderRightWidth, bottom: s.borderBottomWidth, left: s.borderLeftWidth, colour: s.borderTopColor, bg: s.backgroundColor, radius: s.borderTopLeftRadius }; };

  // Outer green frame: the shell and its inner surface. Gaps are measured from the shell's inner edge.
  const shell = document.querySelector(".editor-shell");
  const inner = document.querySelector(".editor-shell-inner");
  let frame = null;
  if (shell && inner) {
    const s = shell.getBoundingClientRect(), i = inner.getBoundingClientRect(), b = getComputedStyle(shell);
    frame = {
      shell: rectOf(shell), inner: rectOf(inner), border: borders(shell),
      gapLeft: +(i.left - s.left - parseFloat(b.borderLeftWidth)).toFixed(2),
      gapRight: +(s.right - i.right - parseFloat(b.borderRightWidth)).toFixed(2),
      gapTop: +(i.top - s.top - parseFloat(b.borderTopWidth)).toFixed(2),
      gapBottom: +(s.bottom - i.bottom - parseFloat(b.borderBottomWidth)).toFixed(2),
    };
  }

  const panel = document.querySelector('[data-testid="editor-properties-panel"]');
  const headingWords = /^(Transform|Constraints|Appearance|Fill|Stroke|Effects|Export|Colou?r variables|Variables|Styles|Modifiers|Layout|变换|约束|外观|填充|描边|效果|导出|颜色变量|样式|修饰器|修改器)$/;
  const headings = [];
  if (panel) {
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (!headingWords.test(text)) continue;
      const el = node.parentElement;
      const chain = [];
      let cur = el;
      for (let i = 0; i < 6 && cur && cur !== panel; i += 1) {
        chain.push({ tag: cur.tagName, cls: String(cur.className).slice(0, 90), rect: rectOf(cur), border: borders(cur), childCount: cur.children.length, testid: cur.dataset?.testid ?? null });
        cur = cur.parentElement;
      }
      headings.push({ text, chain });
    }
  }

  // Hairline dividers: thin, full-width-ish elements inside the panel with a visible background or border.
  const dividers = [];
  if (panel) {
    for (const el of panel.querySelectorAll("div, hr, span")) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const thin = (r.height > 0 && r.height <= 2 && r.width > 100) || (r.width > 0 && r.width <= 2 && r.height > 100);
      if (thin && s.backgroundColor !== "rgba(0, 0, 0, 0)") dividers.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), rect: rectOf(el), bg: s.backgroundColor });
    }
  }

  // Bordered controls: buttons, selects and comboboxes with a visible border (the "decor box").
  const boxed = [];
  if (panel) {
    for (const el of panel.querySelectorAll("button, select, input, [role='combobox'], [aria-haspopup], [role='listbox']")) {
      const s = getComputedStyle(el);
      if (parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderLeftWidth) > 0) {
        boxed.push({ tag: el.tagName, role: el.getAttribute("role"), testid: el.dataset?.testid ?? null, text: (el.textContent || "").trim().slice(0, 24), rect: rectOf(el), border: borders(el) });
      }
    }
  }
  return { frame, panelRect: panel ? rectOf(panel) : null, headings, dividers, boxedCount: boxed.length, boxed: boxed.slice(0, 40) };
});

const results = [];
await withEditorBrowser(async ({ page, errors }) => {
  await seedResponsiveDocument(page);
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      await settlePanels(page);
      const name = `${viewport.name}-${theme}`;
      await page.screenshot({ path: join(EVIDENCE, `${name}-window.png`) });
      results.push({ name, ...(await probe(page)) });
    }
  }
  if (errors.length) console.error(`page errors: ${errors.join("\n")}`);
}, { openDocument: true, mcpLink: true });

await writeFile(join(EVIDENCE, "probe.json"), JSON.stringify(results, null, 2));
console.log(`probe written: ${join(EVIDENCE, "probe.json")}`);
