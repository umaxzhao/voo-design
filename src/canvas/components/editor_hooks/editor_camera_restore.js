/**
 * Decides what the fresh-canvas camera effect should do once every page is
 * ready.
 *
 * A tab switch already restored that tab's camera into the store; fitting the
 * whole row would overwrite it. A page set the effect has seen before keep its
 * view too. Anything else is a first open and gets the normal fit.
 */
export function cameraFitDecision({ pendingRestore, fittedSignature, signature }) {
  if (pendingRestore) return "restore";
  if (fittedSignature === signature) return "skip";
  return "fit";
}
