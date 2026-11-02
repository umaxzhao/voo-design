import { useSyncExternalStore } from "react";

// The page-navigation row owns placement; the focused comments surface owns state.
let target = null;
const listeners = new Set();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => target;
const serverSnapshot = () => null;
function setTarget(element) {
  if (target === element) return;
  target = element;
  for (const listener of listeners) listener();
}

export function CommentLauncherHost() {
  return <span ref={setTarget} className="flex shrink-0 items-center empty:hidden" data-testid="comment-launcher-host" />;
}

export function useCommentLauncherHost() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
