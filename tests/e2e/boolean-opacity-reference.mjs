// Independent primitive controls: no editor scene, adapter, or paint helpers.
const POINTS = [[65, 90], [90, 90], [10, 10]];
const read = ctx => POINTS.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
const canvas = () => { const c = document.createElement("canvas"); c.width = 320; c.height = 300; return c; };
async function pixelsFromImage(src) {
  const image = new Image(); image.src = src; await image.decode();
  const output = canvas(), ctx = output.getContext("2d"); ctx.drawImage(image, 0, 0); return read(ctx);
}
function canvasReference(opacity, background, colorAlpha, overlap) {
  const layer = canvas(), paint = layer.getContext("2d");
  paint.fillStyle = overlap ? (colorAlpha ? "#0000ff80" : "#0000ff") : (colorAlpha ? "#ff000080" : "#ff0000"); paint.fillRect(60, 60, 100, 100);
  if (overlap) { paint.fillStyle = colorAlpha ? "#ff000080" : "#ff0000"; paint.fillRect(60, 60, 10, 100); }
  const output = canvas(), ctx = output.getContext("2d");
  ctx.fillStyle = background; ctx.fillRect(0, 0, 320, 300);
  ctx.globalAlpha = opacity; ctx.drawImage(layer, 0, 0); return read(ctx);
}
async function skiaReference(host, surface, gpuCanvas, opacity, background, colorAlpha, overlap, gpu) {
  const kit = host.instance.canvasKit, ctx = surface.getCanvas();
  const layer = new kit.Paint(), paint = new kit.Paint();
  try {
    ctx.clear(kit.parseColorString(background === "transparent" ? "#00000000" : background));
    layer.setAlphaf(opacity); ctx.saveLayer(layer);
    paint.setColor(kit.parseColorString(overlap ? (colorAlpha ? "#0000ff80" : "#0000ff") : (colorAlpha ? "#ff000080" : "#ff0000"))); ctx.drawRect([60, 60, 160, 160], paint);
    if (overlap) { paint.setColor(kit.parseColorString(colorAlpha ? "#ff000080" : "#ff0000")); ctx.drawRect([60, 60, 70, 160], paint); }
    ctx.restore(); surface.flush();
    if (gpu) return await pixelsFromImage(gpuCanvas.toDataURL("image/png"));
    const image = surface.makeImageSnapshot();
    try {
      const bytes = image.encodeToBytes(kit.ImageFormat.PNG, 100);
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      try { return await pixelsFromImage(url); } finally { URL.revokeObjectURL(url); }
    } finally { image.delete(); }
  } finally { layer.delete(); paint.delete(); }
}
export async function opacityMatrix({ host, gpuCanvas, base, renderCanvas, renderSkia }) {
  const results = [], kit = host.instance.canvasKit;
  const cpu = kit.MakeSurface(320, 300), gpu = host.instance.acquireSurface();
  if (!cpu || !gpu) throw new Error("CanvasKit reference surface unavailable");
  try {
    for (const opacity of [0, 0.25, 0.5, 0.75, 1]) for (const background of ["#ffffff", "transparent"]) for (const colorAlpha of [false, true]) {
      const fill = colorAlpha ? "#0000ff80" : "#0000ff", stroke = colorAlpha ? "#ff000080" : "#ff0000";
      const node = { ...base, opacity, fill, stroke, fillOpacity: 1, strokeOpacity: 1, strokeAlign: "inside" };
      const actual = await renderCanvas(node, POINTS, null, true, background);
      const skia = await renderSkia(node, background, POINTS); actual.skia = skia.pixels; actual.stage = skia.stage;
      const refs = {};
      for (const overlap of [false, true]) {
        const key = overlap ? "overlap" : "single";
        refs[key] = {
          canvas: canvasReference(opacity, background, colorAlpha, overlap),
          skia: await skiaReference(host, cpu, gpuCanvas, opacity, background, colorAlpha, overlap, false),
          stage: await skiaReference(host, gpu, gpuCanvas, opacity, background, colorAlpha, overlap, true),
        };
      }
      results.push({ opacity, background, colorAlpha, actual, refs });
    }
    return results;
  } finally { cpu.delete(); }
}
