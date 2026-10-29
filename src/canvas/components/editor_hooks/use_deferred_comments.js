import { useEffect, useReducer } from "react";
import { captureError } from "../../../shared/error_collector.js";

let surface = null;
let pending = null;

function loadSurface() {
  if (surface) return Promise.resolve(surface);
  if (!pending) pending = import("../editor_comments_surface.jsx")
    .then((module) => { surface = module.default; return surface; })
    .catch((error) => { pending = null; throw error; });
  return pending;
}

function reduce(state, action) {
  if (action.type === "ready") return { ...state, Component: action.Component, error: null };
  if (action.type === "failed") return { ...state, error: action.error };
  if (action.type === "retry") return { ...state, error: null, attempt: state.attempt + 1 };
  return state;
}

/** Keep optional module failures local; a failed comments download cannot remove artwork. */
export function useDeferredComments(activated) {
  const [state, dispatch] = useReducer(reduce, null, () => ({ Component: surface, error: null, attempt: 0 }));
  useEffect(() => {
    if (!activated || state.Component || state.error) return undefined;
    let mounted = true;
    void loadSurface().then((Component) => {
      if (mounted) dispatch({ type: "ready", Component });
    }).catch((error) => {
      captureError({ error, message: "comments-surface-load", source: "comments-module" });
      if (mounted) dispatch({ type: "failed", error });
    });
    return () => { mounted = false; };
  }, [activated, state.Component, state.error, state.attempt]);
  return { ...state, retry: () => dispatch({ type: "retry" }) };
}
