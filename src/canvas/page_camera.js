/** Session-only viewport snapshots; documents and engine internals stay untouched. */
export function rememberPageCamera(cameras, id, camera) {
  if (
    !id ||
    !camera ||
    ![camera.panX, camera.panY, camera.zoom].every(Number.isFinite) ||
    camera.zoom <= 0
  )
    return;
  cameras.set(id, { panX: camera.panX, panY: camera.panY, zoom: camera.zoom });
}

export function restorePageCamera(cameras, id, engine) {
  const camera = cameras.get(id);
  if (!camera || typeof engine?.setViewport !== "function") return false;
  engine.setViewport({ ...camera });
  return true;
}

let activeSession;
let sessionCameras = new Map();
export function pageCameraCache(session) {
  if (session !== activeSession) {
    activeSession = session;
    sessionCameras = new Map();
  }
  return sessionCameras;
}

export function forgetPageCamera(cameras, id) {
  cameras.delete(id);
}
