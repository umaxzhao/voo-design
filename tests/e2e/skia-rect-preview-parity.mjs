/** Compare the GPU picture preview with the authoritative GPU scene painter. */
export async function verifySkiaRectPreview() {
  const {
    createSkiaHost
  } = await import("/src/canvas/editor/skia_host.js");
  const {
    createRectNode
  } = await import("/src/canvas/editor/scene_model.js");
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  canvas.style.cssText = "position:fixed;left:-10000px;top:0";
  const host = await createSkiaHost(canvas);
  const width = 900;
  const height = 600;
  host.resize(width, height, 1);
  const viewport = {
    x: 21,
    y: 12,
    zoom: 0.77,
    width,
    height,
    devicePixelRatio: 1
  };
  const nodes = Array.from({
    length: 1000
  }, (_, index) => createRectNode({
    x: index % 50 * 20,
    y: Math.floor(index / 50) * 20,
    width: 16,
    height: 16,
    fill: "#3366ff"
  }));
  let doc = {
    id: "preview-test",
    width: 1000,
    height: 500,
    backgroundColor: "#ffffff",
    nodes
  };
  const options = {
    viewport,
    layouts: {
      "preview-test": {
        x: 48,
        y: 48
      }
    },
    backgroundColor: "#525252"
  };
  try {
    for (const isCanvasRoot of [false, true]) {
      doc = {
        ...doc,
        isCanvasRoot,
        nodes: nodes.map((node, index) => isCanvasRoot && index === 0 ? {
          ...node,
          x: -65,
          y: -35
        } : node)
      };
      await host.draw({
        ...options,
        docs: [doc],
        revision: 1
      });
      for (const patch of [{
        x: -10,
        fill: "#ff6633"
      }, {
        x: 100,
        width: 80
      }, {
        x: 30,
        visible: false
      }]) {
        doc = {
          ...doc,
          nodes: doc.nodes.map((node, index) => index === 100 ? {
            ...node,
            ...patch
          } : node)
        };
        const snapshot = await host.draw({
          ...options,
          docs: [doc],
          revision: 2
        });
        const preview = canvas.toDataURL();
        host.instance.render(snapshot, viewport);
        if (preview !== canvas.toDataURL()) return {
          cached: preview,
          full: canvas.toDataURL(),
          error: `GPU preview mismatch: ${JSON.stringify(patch)}`
        };
      }
    }
    return true;
  } finally {
    host.dispose();
    canvas.remove();
  }
}
