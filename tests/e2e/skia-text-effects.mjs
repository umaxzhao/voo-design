/** Verify that the actual GPU painter receives italic and changes its pixels. */
export async function verifySkiaTextEffects() {
  const { createSkiaHost } = await import("/src/canvas/editor/skia_host.js");
  const { createTextNode } = await import("/src/canvas/editor/scene_model.js");
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const host = await createSkiaHost(canvas);
  try {
    const response = await fetch("/fonts/inter.ttf");
    if (!response.ok) throw new Error("Local Inter font unavailable");
    host.registerFont("Inter", await response.arrayBuffer());
    host.resize(500, 180, 1);
    const runs = [];
    const fonts = host.instance.fonts;
    const create = fonts.createParagraph.bind(fonts);
    fonts.createParagraph = (run, width) => { runs.push(run.italic); return create(run, width); };
    const node = createTextNode({ x: 30, y: 30, text: "Italic effects", fontFamily: "Inter", fontSize: 48, fill: "#000000" });
    const options = { viewport: { width: 500, height: 180, zoom: 1, x: 0, y: 0 }, layouts: { text: { x: 0, y: 0 } } };
    const draw = async (italic, revision) => {
      await host.draw({ ...options, revision, docs: [{ id: "text", width: 500, height: 180, backgroundColor: "#ffffff", nodes: [{ ...node, italic }] }] });
      return canvas.toDataURL();
    };
    const normal = await draw(false, 1);
    const italic = await draw(true, 2);
    return { normalRun: runs.includes(false), italicRun: runs.includes(true), pixelsDiffer: normal !== italic };
  } finally { host.dispose(); canvas.remove(); }
}
