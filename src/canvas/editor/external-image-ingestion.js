import { collectExternalImageLayers } from "../editor_open_state.js";

/** Remember this activation's images so stale saved nodes cannot undo deletion. */
export function createExternalImageTracker(initialLayers = []) {
  const observed = new Set();
  const remember = layers => {
    for (const layer of layers) {
      if (layer?.imageId) observed.add(layer.imageId);
    }
  };
  remember(initialLayers);
  return {
    collect(editorDoc, liveLayers, pending, images) {
      // Include locally inserted/replaced pixels before the saved document
      // catches up; deleting them later must not look like a new delivery.
      remember(liveLayers);
      return collectExternalImageLayers(
        editorDoc, [...liveLayers, ...observed, ...pending], images,
      );
    },
    accept(receipt) {
      for (const imageId of receipt.added) observed.add(imageId);
      for (const skipped of receipt.skipped) {
        if (skipped.reason === "alreadyPresent") observed.add(skipped.imageId);
      }
      // Missing assets and decode errors remain eligible for a later retry.
      // The caller still reports these errors rather than hiding them.
    },
  };
}
