import { isFigmaFontAvailable } from "./figma-text.js";
import { figmaVariables } from "./figma-variables.js";
export function fontSummary(fonts) {
  return [...fonts.values()]
    .map((entry) => ({
      family: entry.family,
      styles: [...entry.styles],
      count: entry.count,
      available: isFigmaFontAvailable(entry.family),
    }))
    .sort((a, b) => b.count - a.count);
}

export function pruneFigSource(figSource) {
  if (!figSource || typeof figSource !== "object") return figSource;
  const message = { ...(figSource.message ?? {}) };
  delete message.nodeChanges;
  delete message.blobs;
  delete message.nodeChangeOrder;
  delete message.originFileKey;
  delete message.ackID;
  return {
    version: figSource.version,
    schema: figSource.schema,
    message,
  };
}


export function createFigmaImportContext(message, images, externalAssets = false, imageHashes = new Set(images.keys())) {
  return { images, imageHashes, externalAssets, assets: {}, warnings: new Map(),
    blobs: Array.isArray(message.blobs) ? message.blobs : [], fonts: new Map(),
    variablesV2: figmaVariables(message) };
}
