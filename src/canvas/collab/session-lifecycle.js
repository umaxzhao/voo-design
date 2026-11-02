/** Document switching can cancel a cold session without importing React. */
let operationRevision = 0;
let stopSession = null;

export function registerCollabStop(handler) {
  stopSession = handler;
}

export function beginCollabOperation() {
  const revision = ++operationRevision;
  return () => revision === operationRevision;
}

/** Invalidate configuration waits before tearing down an already live room. */
export function stopCollabSession() {
  operationRevision++;
  stopSession?.();
}
