/**
 * Where brush strokes cross between the editor and a collaboration session.
 *
 * Neither side should have to know about the other: the picture editor holds
 * live engines and no notion of peers, and the session holds peers and no
 * notion of engines. A tiny bus in the middle is what keeps that true — the
 * editor publishes what was painted and applies what arrives, and the bridge
 * does the same in the other direction.
 *
 * Nothing is buffered. A stroke is only meaningful against the document as it
 * stands, so one that arrives with no editor open is dropped rather than
 * replayed later onto a picture it was never about.
 */

const localListeners = new Set();
const remoteListeners = new Set();

/** The editor reports a stroke the user just painted. */
export function emitLocalStroke(stroke) {
  localListeners.forEach((listener) => listener(stroke));
}

/** The bridge listens here to put local strokes on the wire. */
export function onLocalStroke(listener) {
  localListeners.add(listener);
  return () => localListeners.delete(listener);
}

/** The bridge reports a stroke that arrived from a peer. */
export function emitRemoteStroke(stroke) {
  remoteListeners.forEach((listener) => listener(stroke));
}

/** The editor listens here to replay a peer's stroke into the right engine. */
export function onRemoteStroke(listener) {
  remoteListeners.add(listener);
  return () => remoteListeners.delete(listener);
}
