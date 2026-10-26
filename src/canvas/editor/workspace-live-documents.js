import { workspaceSkiaDocument } from "./workspace-artwork-routing.js";

/** Keep immutable document identity stable on camera/chrome-only frames. */
export function createLiveWorkspaceDocuments() {
  let previous;
  let result;
  let focusedDoc;
  let focusedPageId;
  let focusedScene;
  return (docs, pageId, liveDoc) => {
    if (previous?.docs === docs && previous.pageId === pageId && previous.liveDoc === liveDoc) return result;
    previous = { docs, pageId, liveDoc };
    if (focusedDoc !== liveDoc || focusedPageId !== pageId) {
      focusedDoc = liveDoc;
      focusedPageId = pageId;
      focusedScene = liveDoc ? workspaceSkiaDocument({ ...liveDoc, id: pageId }) : null;
    }
    const next = docs.map(doc => focusedScene && doc.id === pageId ? focusedScene : workspaceSkiaDocument(doc));
    if (!result || result.length !== next.length || next.some((doc, index) => result[index] !== doc)) result = next;
    return result;
  };
}
