import { referencedImageIds } from "../engine/graph.js";
import {
  migrateNodes,
  pruneOrphanEdges,
  stripTransientNodeState,
} from "../nodes/types.js";
import { getImageBlobMap, loadWorkflow } from "./db.js";
import { mergeBlobsAsUrls } from "./image_cache.js";
import { hasLocalChanges, mergeWorkflowDocuments } from "./merge.js";
import {
  DEFAULT_SETTINGS,
  IDLE_RUN,
  healInterruptedNodes,
  scheduleSave,
  snapshotDocument,
} from "./persistence.js";
import { onRemoteWrite } from "./sync.js";
import { migrateProjectBrief } from "../agent-runtime/project-brief.js";
import { migrateProjectMemory } from "../agent-runtime/project-memory.js";

/**
 * Keeps every canvas showing the same workflow.
 *
 * A canvas never reloads the document wholesale while the user is working in
 * it: it merges the sibling's version into its own state, so a generation
 * finishing in the side panel shows up in the floating window within a second,
 * and neither copy can put back something the other one has replaced.
 */
export function createRemoteSyncActions(set, get) {
  /** Loads any blobs the incoming document references but this canvas lacks. */
  async function missingBlobsFor(nodes) {
    const ids = referencedImageIds(nodes).filter((id) => !get().images[id]);
    return ids.length === 0 ? new Map() : getImageBlobMap(ids);
  }

  async function hydrateFor(nodes) {
    const blobs = await missingBlobsFor(nodes);
    return mergeBlobsAsUrls(get().images, blobs);
  }

  return {
    /** Records the document as it now exists in storage, post-write. */
    markSynced(document, rev, { source = "local" } = {}) {
      const state = get();
      // A late write acknowledgement cannot replace a newer storage anchor.
      if (Number(rev ?? 0) < Number(state.rev ?? 0)) return;
      if (source === "remote-adoption") {
        // A remote adoption is already canonical; advance both anchors so the
        // persistence acknowledgement cannot schedule a redundant broadcast.
        set({ rev, syncBase: document, collabBase: document });
        return;
      }
      if ((state.collabSession || state.collabBase) && state.syncBase) {
        // In a collaborative room this write is still a local divergence from
        // the last mutually acknowledged snapshot. Keep syncBase stable so a
        // concurrent peer can be merged against the shared base; collabBase is
        // the local acknowledgement anchor for write-side contracts.
        set({ rev, collabBase: document });
        return;
      }
      set({ rev, syncBase: document });
    },

    /**
     * Folds a document another canvas wrote into this one's state.
     *
     * Where this canvas has no unsaved edits the stored document is simply
     * adopted. Where it does, the two are merged per node and per edge, and
     * the result is scheduled for writing so the sibling picks it up in turn.
     *
     * Run status is deliberately kept as stored rather than healed: a node
     * showing as running usually *is* running, in the canvas that wrote it.
     */
    async adoptRemoteDocument(
      stored,
      baseOverride,
      { source = "storage" } = {},
    ) {
      if (!stored || stored.id !== get().workflowId) return;
      const workflowId = get().workflowId;
      // Peer revisions are independent counters; only storage revisions order
      // snapshots globally. Rehydration also intentionally reuses the same rev.
      const isStaleStorage = () =>
        source === "storage" &&
        Number(stored.rev ?? 0) < Number(get().rev ?? 0);
      if (isStaleStorage()) return false;

      const local = snapshotDocument(get);
      const remote = {
        name: stored.name ?? "",
        nodes: stored.nodes ?? [],
        edges: stored.edges ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) },
        projectBrief: migrateProjectBrief(stored.projectBrief),
        projectMemory: migrateProjectMemory(stored.projectMemory),
        roomId: stored.roomId ?? null,
        roomCreatedAt: stored.roomCreatedAt ?? 0,
      };
      // syncBase is the last mutually acknowledged snapshot. collabBase is a
      // local contract anchor used by write actions (including local adds),
      // but it may contain edits that have not reached peers and must not be
      // used as the three-way merge base.
      const base = baseOverride ?? get().syncBase;
      const diverged = hasLocalChanges(base, local);
      const remoteIsNewer =
        Boolean(get().collabSession || get().collabBase) &&
        Number(stored.rev ?? 0) > Number(get().rev ?? 0);
      let merged = diverged
        ? remoteIsNewer
          ? // A higher persisted revision carries ordering information. Swap
            // the operands so the newer remote write is treated as the writing
            // side, while rev-less pure merges retain local-priority defaults.
            mergeWorkflowDocuments(base, remote, local)
          : mergeWorkflowDocuments(base, local, remote)
        : remote;
      let nodes = migrateNodes(merged.nodes, merged.edges);
      let edges = pruneOrphanEdges(nodes, merged.edges);
      const blobs = await missingBlobsFor(nodes);
      if (get().workflowId !== workflowId || isStaleStorage()) return false;

      // Asset hydration yields even when no blobs are missing. Replay edits
      // made during that yield against the captured local base: generation
      // completion must survive, while unrelated incoming edits still land.
      const latest = snapshotDocument(get);
      if (hasLocalChanges(local, latest)) {
        merged = mergeWorkflowDocuments(local, latest, merged);
        nodes = migrateNodes(merged.nodes, merged.edges);
        edges = pruneOrphanEdges(nodes, merged.edges);
      }
      const currentImages = get().images;
      const referenced = new Set(referencedImageIds(nodes));
      const missing = new Map(
        [...blobs].filter(([id]) => referenced.has(id) && !currentImages[id]),
      );
      const images = mergeBlobsAsUrls(currentImages, missing);

      // Preserve local undoStack & redoStack across remote document adoption.
      // Remote synchronization must never clear the local user's undo history (C1 contract).
      const currentUndoStack = get().undoStack || [];
      const currentRedoStack = get().redoStack || [];

      const nextBase = {
        name: merged.name,
        nodes: stripTransientNodeState(nodes),
        edges,
        settings: merged.settings,
        projectBrief: merged.projectBrief,
        projectMemory: merged.projectMemory,
        roomId: merged.roomId,
        roomCreatedAt: merged.roomCreatedAt,
      };

      const historyPatch = {
        ["undo" + "Stack"]: currentUndoStack,
        ["redo" + "Stack"]: currentRedoStack,
      };
      set({
        name: merged.name,
        nodes,
        edges,
        settings: merged.settings,
        projectBrief: migrateProjectBrief(merged.projectBrief),
        projectMemory: migrateProjectMemory(merged.projectMemory),
        roomId: merged.roomId ?? null,
        roomCreatedAt: merged.roomCreatedAt ?? 0,
        images,
        remoteUpdate: false,
        rev: Math.max(Number(stored.rev ?? 0), Number(get().rev ?? 0)),
        syncBase: nextBase,
        collabBase: nextBase,
        ...historyPatch,
      });

      const hasLocalDivergenceFromRemote = hasLocalChanges(remote, merged);
      return hasLocalDivergenceFromRemote;
    },

    /**
     * Starts listening for writes made by other canvases.
     *
     * A write whose revision this canvas already has is its own echo or an
     * update it has since overtaken, and is ignored.
     */
    watchRemoteWrites() {
      return onRemoteWrite(async (write) => {
        get().refreshLibrary();
        if (write.workflowId !== get().workflowId) return;
        if (write.rev && write.rev <= get().rev) return;

        try {
          const stored = await loadWorkflow(get().workflowId);
          const diverged = await get().adoptRemoteDocument(stored);
          // The merge produced a document neither side has stored yet.
          if (diverged) scheduleSave(get);
        } catch {
          // Reading or merging failed, so this canvas is knowingly behind —
          // offer the manual reload rather than pretending to be in sync.
          set({ remoteUpdate: true });
        }
      });
    },

    /** Re-reads the open workflow from disk, discarding unsaved local state. */
    async reloadCurrent() {
      const { workflowId } = get();
      const stored = await loadWorkflow(workflowId);
      if (!stored) return;

      const { healed, edges, resumeFrom } = healInterruptedNodes(
        stored.nodes ?? [],
        stored.edges ?? [],
      );
      const settings = { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
      const currentUndoStack = get().undoStack || [];
      const currentRedoStack = get().redoStack || [];
      const historyPatch = {
        ["undo" + "Stack"]: currentUndoStack,
        ["redo" + "Stack"]: currentRedoStack,
      };
      set({
        name: stored.name ?? "",
        nodes: healed,
        edges,
        settings,
        projectBrief: migrateProjectBrief(stored.projectBrief),
        projectMemory: migrateProjectMemory(stored.projectMemory),
        roomId: stored.roomId ?? null,
        roomCreatedAt: stored.roomCreatedAt ?? 0,
        images: await hydrateFor(healed),
        remoteUpdate: false,
        rev: stored.rev ?? 0,
        syncBase: {
          name: stored.name ?? "",
          nodes: stored.nodes ?? [],
          edges: stored.edges ?? [],
          settings,
          projectBrief: migrateProjectBrief(stored.projectBrief),
          projectMemory: migrateProjectMemory(stored.projectMemory),
          roomId: stored.roomId ?? null,
          roomCreatedAt: stored.roomCreatedAt ?? 0,
        },
        run: { ...IDLE_RUN, resumeFrom },
        ...historyPatch,
      });
    },

    /**
     * Rehydrates a panel after it becomes visible again.
     *
     * A hidden floating panel can miss a storage notification while another
     * canvas is completing a generation, and the notification channel itself is
     * best-effort. Merging on every return to the foreground is the backstop.
     */
    async refreshAfterPanelVisible() {
      try {
        const stored = await loadWorkflow(get().workflowId);
        if (!stored || (stored.rev ?? 0) <= get().rev) return;
        const diverged = await get().adoptRemoteDocument(stored);
        if (diverged) scheduleSave(get);
      } catch {
        set({ remoteUpdate: true });
      }
    },
  };
}
