// Run with Vite at http://127.0.0.1:5179. Writes small review samples outside the repo.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(process.env.EXPORT_SAMPLE_URL || 'http://127.0.0.1:5179');
  const samples = await page.evaluate(async () => {
    const { createExport } = await import('/src/canvas/editor/editor_export_raster.js');
    const { documentToSvg } = await import('/src/canvas/editor/editor_svg.js');
    const { jpegPageToPdf } = await import('/src/canvas/components/editor_hooks/export_editor_pdf.js');
    const doc = { width: 400, height: 240, backgroundColor: '#ffffff', crop: { x: 40, y: 30, width: 240, height: 150 }, nodes: [
      { id: 'r', kind: 'rect', x: 60, y: 50, width: 90, height: 60, fill: '#36b59a', cornerRadius: 12, opacity: 1 },
      { id: 'e', kind: 'ellipse', x: 170, y: 55, width: 60, height: 60, fill: '#f2a54a', opacity: 0.7 },
      { id: 't', kind: 'text', x: 60, y: 125, width: 180, height: 30, text: 'Editable export', fontSize: 20, fontFamily: 'Arial', fill: '#202030', opacity: 1 },
    ] };
    const api = createExport({ getDoc: () => doc, cache: { get: () => null } });
    const png = api.exportImage({ type: 'image/png', scale: 2, transparent: true });
    const opaque = api.exportImage({ type: 'image/jpeg', scale: 2, transparent: true });
    const selection = api.exportSelectionPng(['r', 'e'], { scale: 2, transparent: true });
    const img = new Image(); img.src = png; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    if (img.width !== 480 || img.height !== 300 || ctx.getImageData(0, 0, 1, 1).data[3] !== 0) throw new Error('PNG crop/alpha regression');
    if (selection.width !== 340 || selection.height !== 130) throw new Error('selection size regression');
    const svg = documentToSvg(doc, { transparent: true, measureCtx: ctx });
    if (!svg.includes('<text ') || !svg.includes('<ellipse ') || svg.includes('<image')) throw new Error('SVG vector regression');
    return { png, jpeg: opaque, selection: selection.dataUrl, svg, pdf: await jpegPageToPdf({ dataUrl: png, width: 240, height: 150 }) };
  });
  await mkdir('/workspace/tmp', { recursive: true });
  for (const [name, data] of Object.entries(samples)) {
    const ext = name === 'selection' ? 'png' : name;
    await writeFile(`/workspace/tmp/export-${name}.${ext}`, name === 'svg' ? data : Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log('Samples verified: crop 480×300, transparent corner, selection 340×130, vector shapes and editable SVG text.');
} finally { await browser.close(); }
