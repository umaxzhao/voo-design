import { createRoomId, roomUrl } from "../collab/room.js";


/**
 * Share-by-link (P2P only) for the free-canvas editor document.
 *
 * Sharing starts a live collaboration room on this page and hands back its
 * `/r/<id>` link. The signaling server only introduces peers: the document,
 * the images and the strokes all travel directly between them.
 */

/** How long a document-bound share link stays valid before it is re-minted. */
export const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Starts a P2P room for the free-canvas editor and returns its link. */
export async function shareWorkflow(access = "edit") {
  const { useDesignStore } = await import("../../store/design_store.js");
  const store = useDesignStore.getState();
  if (typeof store.shareWorkflow === "function") {
    return store.shareWorkflow(access);
  }

  const { getCollabSession, startCollab } = await import(
    "../collab/use_collab.js"
  );
  const session = getCollabSession();
  const joined = session?.getSnapshot?.();
  if (joined?.joinedViaLink && joined.roomId) {
    return roomUrl(joined.roomId, undefined, joined.access);
  }

  const roomId = createRoomId();
  const joinedRoomId = await startCollab(roomId, access);
  if (!joinedRoomId) return null;
  return roomUrl(joinedRoomId, undefined, access);
}

/** Exports the current room state as a self-contained JSON snapshot. */
export async function exportRoomSnapshot() {
  const { useDesignStore } = await import("../../store/design_store.js");
  const { downloadJson } = await import("../download.js");
  const state = useDesignStore.getState();
  const name = state.fileName?.replace(/\.[^/.]+$/, "") || "design";
  const engine = globalThis.window?.__vooEditor;
  const doc = engine?.getDocument?.() ?? {};
  const snapshot = {
    version: 2,
    name,
    nodes: state.nodes ?? [],
    edges: state.edges ?? [],
    images: state.images ?? {},
    document: doc,
  };
  downloadJson(snapshot, `room-${name}`);
  return snapshot;
}

/** Saves the open room session to local disk/project file. */
export async function saveRoomSessionToProjectFolder() {
  if (typeof globalThis.window?.dispatchEvent === "function") {
    globalThis.window.dispatchEvent(new CustomEvent("voo:file-save-as"));
  }
  return true;
}

/** Share store actions, spread into the design store. */
export function createShareActions(set, get) {
  let operationRevision = 0;
  return {
    shareLoading: false,
    shareError: null,
    lastShareUrl: null,

    /** Starts a P2P room for the current editor document and returns its link. */
    async shareWorkflow(access = "edit") {
      const initial = get();
      const { getCollabSession, startCollab } = await import(
        "../collab/use_collab.js"
      );
      const session = getCollabSession();
      const joined = session?.getSnapshot?.();

      if (joined?.joinedViaLink && joined.roomId) {
        const url = roomUrl(joined.roomId, undefined, joined.access);
        set({ shareLoading: false, shareError: null, lastShareUrl: url });
        return url;
      }

      const activeDocumentId = initial.activeDocumentId;
      if (!activeDocumentId) return null;

      const revision = ++operationRevision;
      const ownsDocument = () => {
        const current = get();
        return (
          revision === operationRevision &&
          current.activeDocumentId === activeDocumentId
        );
      };
      const isCurrent = () => ownsDocument();

      set({ shareLoading: true, shareError: null });
      try {
        const state = get();
        let roomId = state.roomId;
        const createdAt = state.roomCreatedAt ?? 0;
        if (!roomId || !createdAt || Date.now() - createdAt > ROOM_TTL_MS) {
          roomId = createRoomId();
          set({ roomId, roomCreatedAt: Date.now() });
        }

        if (!isCurrent()) return null;
        const joinedRoomId = await startCollab(roomId, access, { isCurrent });
        if (!isCurrent()) return null;
        if (!joinedRoomId) throw new Error("roomStartFailed");
        const url = roomUrl(joinedRoomId, undefined, access);
        set({ shareLoading: false, lastShareUrl: url });
        return url;
      } catch (error) {
        if (!ownsDocument()) return null;
        set({ shareLoading: false, shareError: error.message ?? "generic" });
        return null;
      } finally {
        if (ownsDocument()) set({ shareLoading: false });
      }
    },

    clearShareError() {
      set({ shareError: null });
    },

    exportRoomSnapshot,
    saveRoomSessionToProjectFolder,
  };
}
