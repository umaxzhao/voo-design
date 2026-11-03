// LOCAL PREPARATION ONLY: do not push or dispatch without new approval.
// Diagnostic outputs do not replace or relax the original html2nodes gate.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = process.env.VOO_DIAG_ROOT;
const out = process.env.VOO_AA_DIAG_OUT;
if (!root || !path.isAbsolute(root) || !out || !path.isAbsolute(out)) throw new Error('Absolute source and NEW output paths required');
await mkdir(out); // Fail if output already exists; preserve all earlier evidence.
const sha = b => createHash('sha256').update(b).digest('hex');
const { chromium } = await import(`${root}/node_modules/playwright/index.mjs`);
const { startEditorBrowserServer } = await import(`${root}/tests/e2e/editor-browser-server.mjs`);
const postcss = (await import(`${root}/node_modules/postcss/lib/postcss.js`)).default;
const tailwind = (await import(`${root}/node_modules/tailwindcss/lib/index.js`)).default;
const fixtureDir = `${root}/tests/fixtures/html2nodes`;
const fixtures = await Promise.all((await readdir(fixtureDir)).filter(n => n.endsWith('.html')).sort().map(async name => ({ name: name.slice(0, -5), html: await readFile(`${fixtureDir}/${name}`, 'utf8') })));
const css = (await postcss([tailwind({ content: fixtures.map(f => ({ raw: f.html, extension: 'html' })), corePlugins: { preflight: false } })]).process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const reset = '*{box-sizing:border-box}body{margin:0}main{font:16px Arial}';
const meta = {
  sourceHead: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  originalGateSha256: sha(await readFile(`${root}/tests/e2e/html2nodes.e2e.mjs`)),
  scriptSha256: sha(await readFile(new URL(import.meta.url))),
  platform: process.platform, viewport: { width: 320, height: 200 }, deviceScaleFactor: 1,
  launcher: 'Chromium default headless; no sandbox-disable or AA override flags',
  fixtureSha256: Object.fromEntries(fixtures.map(f => [f.name, sha(f.html)])),
};
const server = await startEditorBrowserServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  meta.browserVersion = browser.version();
  const rows = [];
  for (const fixture of fixtures) {
    for (const mode of ['default', 'opaque']) {
      const page = await browser.newPage({ viewport: meta.viewport, deviceScaleFactor: 1 });
      try {
        await page.goto(`${server.origin}/tests/fixtures/html2nodes/flex.html`);
        const measured = await page.evaluate(async ({ fixture, css, reset, mode }) => {
          const { htmlToDocument } = await import('/src/canvas/editor/html_import.js');
          const { drawNode } = await import('/src/canvas/editor/render_node_dispatch.js');
          const tm = await import('/src/canvas/editor/text_metrics.js');
          const markup = `<style>${reset}${css}</style>${fixture.html}`;
          document.body.innerHTML = markup;
          await document.fonts.ready;
          await Promise.all([...document.images].map(i => i.decode()));
          const { doc, pendingImages, warnings } = htmlToDocument(markup, { width: 320, height: 200 });
          const bitmaps = new Map();
          for (const p of pendingImages) { const i = new Image(); i.src = p.src; await i.decode(); bitmaps.set(p.nodeId, i); }
          const c = document.createElement('canvas'); c.width = 320; c.height = 200;
          const ctx = mode === 'opaque' ? c.getContext('2d', { alpha: false }) : c.getContext('2d');
          ctx.fillStyle = doc.backgroundColor; ctx.fillRect(0, 0, 320, 200);
          const texts = [];
          for (const node of doc.nodes) {
            if (node.kind === 'text') {
              ctx.save(); ctx.font = tm.textFont(node);
              if ('letterSpacing' in ctx) ctx.letterSpacing = `${node.letterSpacing ?? 0}px`;
              const layout = tm.getTextLayout(ctx, node);
              texts.push({ text: node.text, x: node.x, y: node.y, boxWidth: node.boxWidth, font: ctx.font, lines: layout.lines, measuredWidths: layout.lines.map(line => tm.measureLineWidth(ctx, line, node.letterSpacing ?? 0)) }); ctx.restore();
            }
            drawNode(ctx, node, n => bitmaps.get(n.id));
          }
          const domRects = [...document.querySelectorAll('main p')].map(el => { const r = document.createRange(); r.selectNodeContents(el); return { text: el.textContent, font: getComputedStyle(el).font, rects: [...r.getClientRects()].map(x => ({ x: x.x, y: x.y, width: x.width, height: x.height })) }; });
          window.__t09AA = c;
          return { contextAttributes: ctx.getContextAttributes?.(), background: doc.backgroundColor, texts, domRects, warnings, dataUrl: c.toDataURL() };
        }, { fixture, css, reset, mode });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
        const { root: domRoot } = await cdp.send('DOM.getDocument');
        const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: domRoot.nodeId, selector: 'main p' });
        const fonts = [];
        for (const nodeId of nodeIds) fonts.push((await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts);
        const prefix = `${fixture.name}-${mode}`;
        const domPng = await page.screenshot();
        const dataPng = Buffer.from(measured.dataUrl.split(',')[1], 'base64');
        delete measured.dataUrl;
        await page.evaluate(() => {
          const c = window.__t09AA;
          document.body.replaceChildren(c);
          document.documentElement.style.cssText = 'margin:0;padding:0;background:white';
          document.body.style.cssText = 'margin:0;padding:0;background:white';
          c.id = 't09-aa-canvas'; c.style.cssText = 'display:block;margin:0;padding:0;border:0;width:320px;height:200px;transform:none';
        });
        const canvasPng = await page.locator('#t09-aa-canvas').screenshot();
        const images = { dom: domPng, dataUrl: dataPng, canvasScreenshot: canvasPng };
        const pairs = {};
        for (const [aName, bName] of [['dom', 'dataUrl'], ['dom', 'canvasScreenshot'], ['dataUrl', 'canvasScreenshot']]) {
          pairs[`${aName}-vs-${bName}`] = await page.evaluate(async ({ a64, b64 }) => {
            const pixels = async b64 => { const i = new Image(); i.src = `data:image/png;base64,${b64}`; await i.decode(); const c = document.createElement('canvas'); c.width = 320; c.height = 200; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, 320, 200).data; };
            const a = await pixels(a64), b = await pixels(b64); let different = 0, absolute = 0;
            for (let i = 0; i < a.length; i += 4) { let max = 0; for (let k = 0; k < 3; k++) { const d = Math.abs(a[i + k] - b[i + k]); max = Math.max(max, d); absolute += d; } if (max > 16) different++; }
            return { differentPixels: different, totalPixels: 64000, originalChannelThreshold: 16, diffPercent: different / 640, meanChannelErrorPercent: absolute / (64000 * 3 * 255) * 100 };
          }, { a64: images[aName].toString('base64'), b64: images[bName].toString('base64') });
        }
        const pngSha256 = {};
        for (const [name, bytes] of Object.entries(images)) { await writeFile(`${out}/${prefix}-${name}.png`, bytes); pngSha256[name] = sha(bytes); }
        rows.push({ fixture: fixture.name, mode, ...measured, fonts, pngSha256, pairs });
      } finally { await page.close(); }
    }
  }
  await writeFile(`${out}/aa-controls.json`, JSON.stringify({ meta, rows, diagnosticOnly: true, originalGateUnchanged: true }, null, 2));
} finally { await browser?.close(); await server.close(); }
