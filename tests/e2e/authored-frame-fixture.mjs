/** Tests that need a Frame author it explicitly; New itself must stay empty. */
export async function createAuthoredFrame(page) {
  return page.evaluate(async () => {
    const editor = window.__vooEditor, doc = editor.getDocument();
    if (!doc.isCanvasRoot || doc.nodes.length) throw new Error("Frame fixture requires an empty canvas");
    const { createGroupNode } = await import("/src/canvas/editor/scene_model.js");
    const frame = { ...createGroupNode({ x: 0, y: 0, width: doc.width, height: doc.height }),
      isFrame: true, frame: true, containerType: "frame", name: "Authored Frame",
      fill: "#171717", clipContent: true };
    editor.setDoc({ ...doc, nodes: [frame] });
    return frame.id;
  });
}
