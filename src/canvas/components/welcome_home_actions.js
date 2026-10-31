import {
  VOO_FILE_FORMAT,
  VOO_FILE_VERSION,
} from "../../../electron/voo_format.js";

export const HTML_IMPORT_ACCEPT = ".html,.htm,text/html";
export const SCREENSHOT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";

export async function importWelcomeHtml(file, store) {
  const [{ htmlToDocument }, { resolveLayoutImages }] = await Promise.all([
    import("../editor/html_import.js"), import("../store/layout_action_helpers.js"),
  ]);
  const { doc: document, pendingImages } = htmlToDocument(await file.text(), { width: 1440, height: 900 });
  await resolveLayoutImages(document, pendingImages);
  store.loadVooProject({
    vooData: { format: VOO_FILE_FORMAT, version: VOO_FILE_VERSION, kind: "design", document, assets: {} },
    fileName: file.name.replace(/\.html?$/i, ".voo"),
  });
  store.setWelcomeOpen(false);
}

/** Use the same browser command as title-bar and external entry points. */
export function openWelcomeBrowser() {
  window.dispatchEvent(new CustomEvent("voo:open-browser"));
}
