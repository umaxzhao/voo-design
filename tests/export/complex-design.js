export async function exportComplexDesign() {
  const { getBaseDefaults } = await import('/src/canvas/editor/scene_doc_factory.js');
  const { createExport } = await import('/src/canvas/editor/editor_export_raster.js');
  const { documentToSvg } = await import('/src/canvas/editor/editor_svg.js');
  const { jpegPageToPdf } = await import('/src/canvas/components/editor_hooks/export_editor_pdf.js');
  const font = new FontFace('ExportFixture', 'url(/fonts/archivo-black.woff2)');
  document.fonts.add(await font.load());
  const bitmap = document.createElement('canvas'); bitmap.width = 32; bitmap.height = 32;
  const b = bitmap.getContext('2d');
  b.fillStyle = '#00ff00'; b.fillRect(0, 0, 32, 32);
  b.fillStyle = '#ff00ff'; b.fillRect(16, 0, 16, 16); b.fillRect(0, 16, 16, 16);
  const rect = (id, x, y, fill, extra = {}) => ({ id, kind: 'rect', x, y, width: 64, height: 64, fill, opacity: 1, ...extra });
  const doc = { width: 256, height: 160, backgroundColor: 'transparent', nodes: [
    rect('linear', 8, 8, 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)'),
    rect('radial', 88, 8, 'radial-gradient(ellipse 50% 25% at 25% 25%, #ffffff 0%, #000000 100%)'),
    { id: 'bitmap', kind: 'image', imageId: 'checker', x: 176, y: 8, width: 64, height: 64, opacity: 0.5 },
    rect('alpha', 8, 88, 'rgba(255, 0, 0, 0.5)', { opacity: 0.5, width: 48, height: 48 }),
    { id: 'text', kind: 'text', x: 72, y: 88, width: 176, height: 60, text: 'Export\nPixels', fontFamily: 'ExportFixture', fontSize: 20, fill: '#102030', opacity: 0.4 },
  ] };
  doc.nodes = doc.nodes.map(node => ({ ...getBaseDefaults(), ...node }));
  const api = createExport({ getDoc: () => doc, cache: { get: () => bitmap } });
  const png = api.exportImage({ type: 'image/png', transparent: true });
  let svg = documentToSvg(doc, { transparent: true, bitmapOf: () => bitmap.toDataURL(), measureCtx: b });
  // SVG images are decoded in an isolated document; embed the pinned font.
  const fontBytes = new Uint8Array(await (await fetch('/fonts/archivo-black.woff2')).arrayBuffer());
  let fontBinary = ''; for (const byte of fontBytes) fontBinary += String.fromCharCode(byte);
  svg = svg.replace(/(<svg\b[^>]*>)/, `$1<style>@font-face{font-family:ExportFixture;src:url(data:font/woff2;base64,${btoa(fontBinary)})}</style>`);
  const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  return { png, svg, svgUrl, pdf: await jpegPageToPdf({ dataUrl: png, width: 256, height: 160 }) };
}
