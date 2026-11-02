import { runHtmlPipeline } from "../../src/canvas/agent/html_pipeline/pipeline.js";
import { streamChatTurn } from "../../src/canvas/agent/chat_stream.js";
import { getAgentCursor, drawAgentCursorOverlay } from "../../src/canvas/editor/chrome-agent-feedback.js";

/** Real transport, DOM layout, native engine and canvas; only model output is controlled. */
export function startAuthoringHarness(baseUrl) {
  const editor = window.__vooEditor;
  const controller = new AbortController();
  const state = { controller, done: false, error: null, progress: [], frames: [] };
  window.__authoring = state;
  const sample = () => {
    const doc = editor.getDocument();
    const cursor = getAgentCursor(doc);
    state.frames.push({
      ids: doc.nodes.map(node => node.id),
      cursor: cursor ? { x: cursor.x, y: cursor.y, drag: Boolean(cursor.drag) } : null,
    });
    if (state.frames.length > 1500) state.frames.shift();
    if (!state.done) state.raf = requestAnimationFrame(sample);
  };
  state.raf = requestAnimationFrame(sample);
  const frame = { x: 0, y: 0, width: 600, height: 400 };
  state.promise = runHtmlPipeline({
    brief: "Create a clear product page", frame, editor, signal: controller.signal,
    streamStep: streamChatTurn,
    config: { baseUrl, apiKey: "offline-fixture", model: "controlled-stream", htmlReferenceGenerator: async () => null },
    onProgress: progress => state.progress.push(progress),
    chooseDirection: async () => "auto",
  }).then(value => { state.result = value; }, error => { state.error = { name: error.name, message: error.message }; })
    .finally(() => { state.done = true; cancelAnimationFrame(state.raf); });
}

export async function authoringPixels() {
  const editor = window.__vooEditor;
  const source = await editor.exportPngCanvas();
  const canvas = document.createElement("canvas");
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext("2d"); context.drawImage(source, 0, 0);
  const sample = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
  return { first: sample(50, 50), last: sample(450, 250) };
}

export function cursorPixels() {
  const canvas = document.createElement("canvas"); canvas.width = 700; canvas.height = 500;
  const context = canvas.getContext("2d");
  drawAgentCursorOverlay(context, getAgentCursor(window.__vooEditor.getDocument()), { zoom: 1, panX: 0, panY: 0 });
  const pixels = context.getImageData(0, 0, 700, 500).data;
  let purple = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] === 229 && pixels[index + 1] === 178 && pixels[index + 2] === 255 && pixels[index + 3] > 100) purple++;
  }
  return purple;
}
