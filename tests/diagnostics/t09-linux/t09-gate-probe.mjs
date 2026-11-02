// Diagnostic only, not a gate. Uses the same reset and CSS markup as tests/e2e/html2nodes.e2e.mjs
// (tailwind css generated from the fixture set, reset appended), so DOM geometry and editor geometry
// are measured on identical markup. Writes NEW files; the earlier out/*.json are left untouched.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
const QA = process.env.VOO_DIAG_ROOT;
if (!QA || !QA.startsWith('/')) throw new Error('VOO_DIAG_ROOT must be an absolute fixed-checkout root');
const { chromium } = await import(`${QA}/node_modules/playwright/index.mjs`);
const { startEditorBrowserServer } = await import(`${QA}/tests/e2e/editor-browser-server.mjs`);
const postcss = (await import(`${QA}/node_modules/postcss/lib/postcss.js`)).default;
const tailwind = (await import(`${QA}/node_modules/tailwindcss/lib/index.js`)).default;
const OUT = process.env.VOO_DIAG_OUT;
if (!OUT || !OUT.startsWith('/')) throw new Error('VOO_DIAG_OUT must be an absolute NEW evidence path');
await mkdir(OUT, { recursive: true });
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const fixtureDir = `${QA}/tests/fixtures/html2nodes`;
const fixtureNames = (await readdir(fixtureDir)).filter((n) => n.endsWith('.html')).sort();
const fixtures = await Promise.all(fixtureNames.map(async (name) => ({ name: name.replace('.html', ''), html: await readFile(`${fixtureDir}/${name}`, 'utf8') })));
const css = (await postcss([tailwind({ content: fixtures.map((f) => ({ raw: f.html, extension: 'html' })), corePlugins: { preflight: false } })]).process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const reset = '*{box-sizing:border-box}body{margin:0}main{font:16px Arial}';
const typography = fixtures.find((f) => f.name === 'typography');
const markup = `<style>${reset}${css}</style>${typography.html}`;
const hashes = {
  typographyFixtureSha256: sha(await readFile(`${fixtureDir}/typography.html`)),
  html2nodesTestSha256: sha(await readFile(`${QA}/tests/e2e/html2nodes.e2e.mjs`)),
  thisScriptSha256: sha(await readFile(new URL(import.meta.url))),
  qaHead: (await import('node:child_process')).execFileSync('git', ['-C', QA, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
};
const server = await startEditorBrowserServer();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const version = browser.version();
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 1 });
  await page.goto(`${server.origin}/tests/fixtures/html2nodes/flex.html`);
  const geometry = await page.evaluate(async (markup) => {
    const { htmlToDocument } = await import('/src/canvas/editor/html_import.js');
    const tm = await import('/src/canvas/editor/text_metrics.js');
    document.body.innerHTML = markup;
    await document.fonts.ready;
    const { doc, warnings } = htmlToDocument(markup, { width: 320, height: 200 });
    const ctx = document.createElement('canvas').getContext('2d');
    const rows = [];
    for (const el of document.querySelectorAll('main p')) {
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      const range = document.createRange(); range.selectNodeContents(el);
      const rects = [...range.getClientRects()].map((r) => ({ x: r.left, y: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }));
      const node = doc.nodes.find((n) => n.kind === 'text' && n.text?.replace(/\s+/g, ' ').trim() === text);
      const row = { text, domRects: rects, domLineCount: new Set(rects.map((r) => Math.round(r.y))).size };
      if (node) {
        ctx.font = tm.textFont(node);
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${node.letterSpacing ?? 0}px`;
        const layout = tm.getTextLayout(ctx, node);
        Object.assign(row, {
          importedNode: { id: node.id, x: node.x, y: node.y, width: node.width, boxWidth: node.boxWidth, letterSpacing: node.letterSpacing, lineHeight: node.lineHeight, fontWeight: node.fontWeight, fontSize: node.fontSize, fontFamily: node.fontFamily, font: ctx.font },
          measureLineWidth: layout.lines.map((line) => ({ line, width: tm.measureLineWidth(ctx, line, node.letterSpacing ?? 0), fits: tm.measureLineWidth(ctx, line, node.letterSpacing ?? 0) <= (node.boxWidth ?? 0) })),
          layoutTextLines: layout.lines,
        });
      }
      rows.push(row);
    }
    return { warnings, rows, bodyMarginPx: getComputedStyle(document.body).marginTop };
  }, markup);
  const fonts = await (async () => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'main p' });
    const out = [];
    for (const nodeId of nodeIds) out.push((await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts);
    return out;
  })();
  const sensitivity = await page.evaluate(async ({ markup, deltas }) => {
    const { htmlToDocument } = await import('/src/canvas/editor/html_import.js');
    const { drawNode } = await import('/src/canvas/editor/render_node_dispatch.js');
    const tm = await import('/src/canvas/editor/text_metrics.js');
    document.body.innerHTML = markup;
    await document.fonts.ready;
    const reference = await (async () => null)();
    void reference;
    const out = [];
    for (const delta of deltas) {
      const { doc } = htmlToDocument(markup, { width: 320, height: 200 });
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 200;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = doc.backgroundColor; ctx.fillRect(0, 0, 320, 200);
      const lines = [];
      for (const node of doc.nodes) {
        if (node.kind === 'text' && typeof node.boxWidth === 'number') {
          node.boxWidth += delta;
          const m = document.createElement('canvas').getContext('2d');
          m.font = tm.textFont(node);
          if ('letterSpacing' in m) m.letterSpacing = `${node.letterSpacing ?? 0}px`;
          lines.push({ text: node.text, lines: tm.getTextLayout(m, node).lines.length, boxWidth: node.boxWidth });
        }
        drawNode(ctx, node, () => undefined);
      }
      out.push({ delta, lines, native: canvas.toDataURL() });
    }
    return out;
  }, { markup, deltas: [0, -0.001, -0.01] });
  // Pixel diff against the same DOM screenshot the gate takes.
  await page.evaluate((markup) => { document.body.innerHTML = markup; }, markup);
  await page.evaluate(() => document.fonts.ready);
  const domB64 = (await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 200 } })).toString('base64');
  for (const row of sensitivity) {
    row.pixel = await page.evaluate(async ({ domB64, native }) => {
      const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const [ia, ib] = await Promise.all([load(`data:image/png;base64,${domB64}`), load(native)]);
      const c = document.createElement('canvas'); c.width = 320; c.height = 200;
      const x = c.getContext('2d');
      x.drawImage(ia, 0, 0); const a = x.getImageData(0, 0, 320, 200).data;
      x.clearRect(0, 0, 320, 200); x.drawImage(ib, 0, 0); const b = x.getImageData(0, 0, 320, 200).data;
      let different = 0; let absolute = 0;
      for (let i = 0; i < a.length; i += 4) {
        const max = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (max > 16) different++;
        absolute += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      }
      return { diffPercent: +(different / (320 * 200) * 100).toFixed(3), meanChannelErrorPercent: +(absolute / (320 * 200 * 3 * 255) * 100).toFixed(3) };
    }, { domB64, native: row.native });
    delete row.native;
  }
  const meta = { sourceRoot: QA, servedOrigin: server.origin, runtimeUrl: page.url(), markupSha256: sha(markup), browser: 'chromium', browserVersion: version, platform: process.platform, hashes, deltas: [0, -0.001, -0.01] };
  await writeFile(`${OUT}/gate-geometry-typography.json`, JSON.stringify({ meta, fonts, ...geometry }, null, 2));
  await writeFile(`${OUT}/gate-sensitivity-typography.json`, JSON.stringify({ meta, rows: sensitivity }, null, 2));
  console.log(JSON.stringify({ meta, bodyMarginPx: geometry.bodyMarginPx, firstDomX: geometry.rows[0]?.domRects[0]?.x, firstNodeX: geometry.rows[0]?.importedNode?.x, sensitivity: sensitivity.map((s) => ({ delta: s.delta, pixel: s.pixel, lines: s.lines.map((l) => l.lines) })) }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
