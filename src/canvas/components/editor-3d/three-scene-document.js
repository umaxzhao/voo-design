/** Preserve current timeline evaluation when an editor supplies a live document. */
export function readCurrentThreeSceneDocument(engine, fallbackDocument) {
  return (
    engine?.getEvaluatedDocument?.() ??
    engine?.getDocument?.() ??
    fallbackDocument
  );
}

/** Resolve the document that an imperative viewport capture must render. */
export function resolveThreeSceneDocument({
  latestDocument,
  getDocument,
  preferProvidedDocument,
  xyProjection,
  projectToXY,
}) {
  // Embedded instances already include camera/view overrides in their supplied
  // document. Reading the source engine would discard those instance settings.
  if (preferProvidedDocument) return latestDocument;

  // React props can lag a synchronous engine mutation, and doc.canvasId is not
  // the workflow registry key. Capture uses the host's explicit live callback.
  const engineDocument = getDocument?.();
  if (!engineDocument) return latestDocument;
  return xyProjection ? projectToXY(engineDocument) : engineDocument;
}
