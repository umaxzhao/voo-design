/** Window event fired when an editable engine becomes ready, changes or closes. */
export const EDITOR_ENGINE_CHANGE_EVENT = "voo:editor-engine-change";

// The global page map is populated before asynchronous open finishes. Keep
// readiness separate without retaining disposed engines or importing the engine.
const readyEngines = new WeakSet();

export function setEditorEngineReady(engine, ready) {
  if (ready) readyEngines.add(engine);
  else readyEngines.delete(engine);
}

export function isEditorEngineReady(engine) {
  return Boolean(engine && readyEngines.has(engine));
}
