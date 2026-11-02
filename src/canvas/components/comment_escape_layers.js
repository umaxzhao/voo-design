// ─── Escape layering ────────────────────────────────────────────────────────
// The editor owns a capture-phase Escape handler that unwinds tools and
// selection. A comment popover must consume Escape first. Registering the
// listener at module evaluation (this module is imported eagerly by the editor)
// guarantees it sits before the editor hook, whatever order the overlay mounts
// in. Only a layer that actually handles Escape stops the event, so with no
// comments open the editor's Escape behaviour is untouched.
const escapeLayers = new Set();

function runEscapeLayers() {
  const handlers = [...escapeLayers].reverse();
  for (const handler of handlers) {
    if (handler()) return true;
  }
  return false;
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (!runEscapeLayers()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
}


export function registerCommentEscapeLayer(handler) {
  escapeLayers.add(handler);
  return () => escapeLayers.delete(handler);
}
