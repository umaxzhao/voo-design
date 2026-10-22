const MEDIA_KINDS = new Set(["video", "model3d"]);

export function mediaAssetIdsInSource(source) {
  return [
    ...new Set(
      (source?.savedDoc?.nodes ?? [])
        .map((node) =>
          node.kind === "canvasInstance"
            ? node.instance?.videoAssetId
            : MEDIA_KINDS.has(node.kind)
              ? node.assetId
              : null,
        )
        .filter(Boolean),
    ),
  ];
}

/** Refresh session-scoped URLs while preserving every saved scene parameter. */
export function withHydratedMediaSources(source, images) {
  const doc = source?.savedDoc;
  if (!doc?.nodes) return source;
  return {
    ...source,
    savedDoc: {
      ...doc,
      nodes: doc.nodes.map((node) => {
        if (node.kind === "canvasInstance" && node.instance?.videoAssetId) {
          const src = images[node.instance.videoAssetId];
          if (!src)
            throw new Error(
              `Missing instance video asset: ${node.instance.videoAssetId}`,
            );
          return { ...node, instance: { ...node.instance, videoSrc: src } };
        }
        if (!MEDIA_KINDS.has(node.kind) || !node.assetId) return node;
        const src = images[node.assetId];
        if (!src) throw new Error(`Missing media asset: ${node.assetId}`);
        return { ...node, src };
      }),
    },
  };
}
