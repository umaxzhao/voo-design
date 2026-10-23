// Run with: flock /tmp/voo-e2e.lock node scripts/text-perf/benchmark.mjs
// Baseline is the pre-cache implementation, pinned so future runs remain comparable.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
console.log('Text layout benchmark acquired browser lock.');
const baselineRef = 'c855437e159d1fa64652784f1b09c8ca07cb7ca3';
let output = '/workspace/tmp/shots-text-perf';
const oldSource = (file) => execFileSync('git', ['show', `${baselineRef}:src/canvas/editor/${file}`], { encoding: 'utf8' })
  .replaceAll('"./', '"/src/canvas/editor/')
  .replace('"/src/canvas/editor/text_metrics.js"', '"/text-perf-metrics.js"');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'text-perf-baseline',
  resolveId(id) { if (id === '/text-perf-before.js' || id === '/text-perf-metrics.js') return id; },
  load(id) {
    if (id === '/text-perf-before.js') return oldSource('render_text_node.js');
    if (id === '/text-perf-metrics.js') return oldSource('text_metrics.js');
  },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route(server.resolvedUrls.local[0], route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto(server.resolvedUrls.local[0]);
  const results = await page.evaluate(async () => {
    const before = await import('/text-perf-before.js');
    const after = await import('/src/canvas/editor/render_text_node.js');
    const { clearTextLayoutCache } = await import('/src/canvas/editor/text_metrics.js');
    document.body.innerHTML = '<canvas width="1440" height="1000"></canvas>';
    const ctx = document.querySelector('canvas').getContext('2d');
    let calls = 0;
    const original = ctx.measureText.bind(ctx);
    ctx.measureText = text => { calls++; return original(text); };
    const nodes = Array.from({ length: 2200 }, (_, i) => ({
      text: `Text node ${i}: Layout caching keeps editing responsive. 中文排版测试。`,
      fontFamily: 'sans-serif', fontSize: 12, fontWeight: 400, lineHeight: 1.25,
      letterSpacing: 0, boxWidth: 190, width: 190, height: 60,
      x: (i % 55) * 210, y: Math.floor(i / 55) * 75, fill: '#172554',
    }));
    const result = { nodes: nodes.length, frames: 30, baselineRef: null, measurements: [] };
    for (const [version, renderer] of [['before', before], ['after', after]]) {
      for (const action of ['pan', 'zoom', 'move']) {
        clearTextLayoutCache();
        calls = 0;
        const coldStart = performance.now();
        for (const node of nodes) renderer.paintTextBody(ctx, node);
        const coldMs = +(performance.now() - coldStart).toFixed(2);
        const coldMeasureTextCalls = calls;
        calls = 0;
        const times = [];
        for (let frame = 0; frame < result.frames; frame++) {
          await new Promise(requestAnimationFrame);
          const start = performance.now();
          ctx.resetTransform(); ctx.clearRect(0, 0, 1440, 1000);
          ctx.scale(0.12, 0.12);
          if (action === 'pan') ctx.translate(frame * 3, frame * 2);
          if (action === 'zoom') ctx.scale(1 + frame / 300, 1 + frame / 300);
          for (const node of nodes) {
            if (action === 'move') { node.x += 0.1; node.y += 0.1; }
            renderer.paintTextBody(ctx, node);
          }
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        result.measurements.push({ version, action, coldMs, coldMeasureTextCalls, medianMs: +times[15].toFixed(2), p95Ms: +times[28].toFixed(2), measureTextCalls: calls });
      }
    }
    return result;
  });
  results.baselineRef = baselineRef;
  console.log(JSON.stringify(results, null, 2));
  try {
    await mkdir(output, { recursive: true });
  } catch (error) {
    if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    output = '/tmp/shots-text-perf';
    await mkdir(output, { recursive: true });
    console.log('Requested screenshot directory is unavailable; using ' + output);
  }
  await page.screenshot({ path: `${output}/text-heavy.png` });
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2) + '\n');
  console.log('Screenshot: ' + output + '/text-heavy.png');
} finally {
  await browser?.close();
  await server.close();
}
