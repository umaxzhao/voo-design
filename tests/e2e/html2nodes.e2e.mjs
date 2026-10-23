// Run with: flock /tmp/voo-e2e.lock node tests/e2e/html2nodes.e2e.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = process.env.HTML2NODES_SHOTS ?? '/workspace/tmp/shots-html2nodes';
await mkdir(output, { recursive: true });
const fixtureDir = new URL('../fixtures/html2nodes/', import.meta.url);
const fixtures = await Promise.all((await readdir(fixtureDir)).filter(n => n.endsWith('.html')).sort().map(async name => ({ name: name.replace('.html', ''), html: await readFile(new URL(name, fixtureDir), 'utf8') })));
const css = (await postcss([tailwind({ content: fixtures.map(f => ({ raw: f.html, extension: 'html' })), corePlugins: { preflight: false } })]).process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const reset = '*{box-sizing:border-box}body{margin:0}main{font:16px Arial}';
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
let browser;
const report = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/html2nodes/flex.html`);
  for (const fixture of fixtures) {
    const result = await page.evaluate(async ({ html, css, reset }) => {
      const { htmlToDocument } = await import('/src/canvas/editor/html_import.js');
      const { drawNode } = await import('/src/canvas/editor/render_node_dispatch.js');
      document.body.innerHTML = `<style>${reset}${css}</style>${html}`;
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
      const { doc, pendingImages, warnings } = htmlToDocument(`<style>${reset}${css}</style>${html}`, { width: 320, height: 200 });
      const bitmaps = new Map();
      for (const pending of pendingImages) {
        const image = new Image(); image.src = pending.src; await image.decode(); bitmaps.set(pending.nodeId, image);
      }
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 200;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = doc.backgroundColor; ctx.fillRect(0, 0, 320, 200);
      for (const node of doc.nodes) drawNode(ctx, node, n => bitmaps.get(n.id));
      window.__html2nodesCanvas = canvas;
      return { nodes: doc.nodes, warnings, native: canvas.toDataURL() };
    }, { ...fixture, css, reset });
    const htmlShot = `${output}/${fixture.name}-html.png`;
    await page.screenshot({ path: htmlShot });
    const nativeShot = `${output}/${fixture.name}-canvas.png`;
    await writeFile(nativeShot, Buffer.from(result.native.split(',')[1], 'base64'));
    const diff = await page.evaluate(async screenshot => {
      const image = new Image(); image.src = screenshot; await image.decode();
      const reference = document.createElement('canvas'); reference.width = 320; reference.height = 200;
      const ctx = reference.getContext('2d'); ctx.drawImage(image, 0, 0);
      const a = ctx.getImageData(0, 0, 320, 200).data;
      const b = window.__html2nodesCanvas.getContext('2d').getImageData(0, 0, 320, 200).data;
      const delta = ctx.createImageData(320, 200); let different = 0; let absolute = 0;
      for (let i = 0; i < a.length; i += 4) {
        const max = Math.max(...[0, 1, 2].map(c => Math.abs(a[i+c] - b[i+c])));
        if (max > 16) different++;
        for (let c = 0; c < 3; c++) absolute += Math.abs(a[i+c] - b[i+c]);
        delta.data.set(max > 16 ? [255, 0, 80, 255] : [255,255,255,255], i);
      }
      ctx.putImageData(delta, 0, 0);
      return { diffPercent: different / (320*200) * 100, meanChannelErrorPercent: absolute / (320*200*3*255) * 100, image: reference.toDataURL() };
    }, `data:image/png;base64,${(await readFile(htmlShot)).toString('base64')}`);
    await writeFile(`${output}/${fixture.name}-diff.png`, Buffer.from(diff.image.split(',')[1], 'base64'));
    const row = { fixture: fixture.name, nodes: result.nodes.length, diffPercent: +diff.diffPercent.toFixed(3), meanChannelErrorPercent: +diff.meanChannelErrorPercent.toFixed(3), warnings: result.warnings };
    report.push(row); console.log(JSON.stringify(row));
    assert(result.nodes.length > 0);
    if (['flex', 'grid', 'tailwind'].includes(fixture.name)) assert(result.nodes.some(n => n.autoLayout), `${fixture.name}: missing auto layout`);
    if (fixture.name === 'typography') {
      assert.equal(result.nodes.find(n => n.kind === 'text').text, 'Canvas type');
      assert.equal(result.nodes.find(n => n.kind === 'text').fontWeight, '500');
    }
    if (fixture.name === 'media') { assert(result.nodes.some(n => n.kind === 'path')); assert(result.nodes.some(n => n.kind === 'image')); }
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  for (const row of report) assert(row.diffPercent < 1, `${row.fixture}: ${row.diffPercent}% pixels differ (limit 1%)`);
} finally {
  await browser?.close();
  await server.close();
}
