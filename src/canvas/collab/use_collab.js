import { useSyncExternalStore } from "react";

const listeners = new Set();
const snapshot = {
  status: "off",
  roomId: null,
  link: null,
  selfId: null,
  peers: [],
  access: "edit",
  readOnly: false,
  active: false,
};

export function requestCollabOriginal(ids) {
  // Standalone mode: all images are already local
}

export function collabRoomWorkflowId() {
  return null;
}

export function setCollabIdentity(next) {
  // Standalone mode: collab identity is local
}

export function useCollabState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}
