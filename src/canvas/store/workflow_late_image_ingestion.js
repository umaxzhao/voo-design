/** Mount a completed image when its wire is added after generation. */
import { HANDLE, NODE_TYPE } from "../nodes/node_enums.js";

export function imageResultForConnection(nodes, connection) {
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  const designTarget =
    target?.type === NODE_TYPE.IMAGE_EDITOR ||
    (target?.type === NODE_TYPE.PREVIEW &&
      (!target.data?.mediaType || target.data.mediaType === "image"));
  if (!source || !designTarget) return null;
  if (![HANDLE.IMAGE, HANDLE.MEDIA].includes(connection.sourceHandle)) {
    return null;
  }
  if (
    connection.sourceHandle === HANDLE.MEDIA &&
    source.data?.mediaType !== "image" &&
    !(
      source.type === NODE_TYPE.PREVIEW &&
      !source.data?.mediaType &&
      source.data?.imageId
    )
  ) {
    return null;
  }

  const data = source.data ?? {};
  const results = Array.isArray(data.results) ? data.results : [];
  const activeResult = results[data.selectedIndex ?? 0] ?? results[0];
  const assetId =
    source.type === NODE_TYPE.PREVIEW || source.type === NODE_TYPE.IMAGE_EDITOR
      ? (data.imageId ?? data.assetId ?? activeResult)
      : activeResult;
  return typeof assetId === "string" && assetId ? assetId : null;
}

export function ingestExistingImageConnections(get, connections) {
  for (const connection of connections) {
    const assetId = imageResultForConnection(get().nodes, connection);
    if (!assetId) continue;
    // Target the new Design wire only. Other downstream branches must not
    // acquire a layer merely because this connection was added later.
    get().autoIngestResultsToDownstream(
      connection.source,
      [assetId],
      connection.target,
    );
  }
}
