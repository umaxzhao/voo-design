import { dispatchToAgent } from "./dispatch_to_agent.js";
import { resolveLayoutImages } from "../store/layout_action_helpers.js";
import { htmlToDocument } from "../editor/html_import.js";

export const HTML_IMPORT_ACCEPT = ".html,.htm,text/html";
export const SCREENSHOT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";

export async function importWelcomeHtml(file, store) {
  const { doc: document, pendingImages } = htmlToDocument(await file.text(), { width: 1440, height: 900 });
  await resolveLayoutImages(document, pendingImages);
  store.loadVooProject({
    vooData: { format: "voo", version: 2, kind: "design", document, assets: {} },
    fileName: file.name.replace(/\.html?$/i, ".voo"),
  });
  store.setWelcomeOpen(false);
}

export async function recreateWelcomeScreenshot(file, { createDesign, getStore, dispatch = dispatchToAgent, wait = () => new Promise((resolve) => setTimeout(resolve, 50)) }) {
  await createDesign({ name: "Screenshot recreation", width: 1440, height: 900 });
  let targetNodeId = getStore().editingNodeId;
  // The welcome component unmounts before the new artboard finishes loading.
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const state = getStore();
    if (targetNodeId && state.editingNodeId && state.editingNodeId !== targetNodeId) return;
    targetNodeId ||= state.editingNodeId;
    if (state.welcomeOpen || !state.editingNodeId) {
      await wait();
      continue;
    }
    const bridge = state.editorBridges?.[targetNodeId];
    if (bridge?.ready && bridge.engine?.insertImage) {
      const image = await bridge.engine.insertImage(file);
      const context = { targetNodeId, screenshotNodeId: image?.id, fromWelcomeDashboard: true };
      dispatch({
        prompt: "Recreate the UI in the screenshot on this canvas as editable design elements. Match its layout, typography, colors, and spacing; use the screenshot as a reference.",
        intent: "recreate", context, autoSend: true,
      });
      return;
    }
    await wait();
  }
  throw new Error("Screenshot editor did not become ready");
}
