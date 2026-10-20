import { createRoomId, roomUrl } from "../collab/room.js";
import { scheduleSave } from "./persistence.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

/**
 * Share-by-link (P2P only — design-p2-share-clone §3, without the snapshot
 * bucket).
 *
 * Sharing starts a live collaboration room on this page and hands back its
 * `/r/<id>` link. The voo-collab signalling server only introduces peers:
 * the document, the images and the strokes all travel directly between them,
 * so sharing costs the server a few kilobytes of handshake and nothing after
 * that. No snapshot is written anywhere — a link works exactly while the
 * author is in the room, and visitors to an empty room are told it is offline
 * (OfflineSessionNotice) rather than served a stored copy.
 *
 * The room id is bound to the workflow, not to this page: it lives on the
 * workflow document and is reused on every re-share, so the link never drifts
 * while the workflow is current. A binding older than ROOM_TTL_MS is re-minted
 * on the next share — the old link goes stale after a week instead of pointing
 * at a room nobody ever starts again.
 */

/** How long a workflow-bound share link stays valid before it is re-minted. */
export const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Share store actions, spread into the workflow store. */
export function createShareActions(set, get) {
  let operationRevision = 0;
  return {
    shareLoading: false,
    shareError: null,
    lastShareUrl: null,

    /** Starts a P2P room for the current workflow and returns its link. */
    async shareWorkflow(access) {
      const initial = get();
      const joined = initial.collabSession?.getSnapshot?.();
      // Guests copy the host's link and permission without restarting as hosts.
      if (joined?.joinedViaLink && joined.roomId) {
        const url = roomUrl(joined.roomId, undefined, joined.access);
        set({ shareLoading: false, shareError: null, lastShareUrl: url });
        return url;
      }
      if (!initial.workflowId || isWorkflowReadOnly(initial)) return null;
      const { workflowId, workflowHistories } = initial;
      const revision = ++operationRevision;
      // History ownership also distinguishes A -> B -> A from the old A session.
      const ownsDocument = () => {
        const current = get();
        return (
          revision === operationRevision &&
          current.workflowId === workflowId &&
          current.workflowHistories === workflowHistories
        );
      };
      const isCurrent = () => ownsDocument() && !isWorkflowReadOnly(get());
      set({ shareLoading: true, shareError: null });
      try {
        // Resolve the workflow's bound room id. Reuse it while it is younger
        // than the TTL; a stale binding is dropped so the next id is fresh.
        const state = get();
        let roomId = state.roomId;
        const createdAt = state.roomCreatedAt ?? 0;
        if (!roomId || !createdAt || Date.now() - createdAt > ROOM_TTL_MS) {
          roomId = createRoomId();
          set({ roomId, roomCreatedAt: Date.now() });
          // Persist the binding so the same workflow re-shares the same link.
          scheduleSave(get);
        }
        // Lazy: the collab session and its WebRTC transport only come into
        // existence when someone actually shares.
        const { startCollab } = await import("../collab/use_collab.js");
        if (!isCurrent()) return null;
        const joinedRoomId = await startCollab(
          roomId,
          state.workflowId,
          access,
          { isCurrent },
        );
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
  };
}
