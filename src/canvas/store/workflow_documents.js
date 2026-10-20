import { referencedImageIds } from "../engine/graph.js";
import { t } from "../../shared/i18n.js";
import { workflowAssetRetentionNodes } from "./workflow_asset_retention.js";
import {
  migrateNodes,
  pruneOrphanEdges,
  stripTransientNodeState,
} from "../nodes/types.js";
import { NODE_TYPE } from "../nodes/types.js";
import {
  getImageBlobMap,
  loadWorkflow,
  putImages,
  saveWorkflow,
} from "./db.js";
import { fetchAssetDataUrl } from "../provider_client.js";
import { mergeBlobsAsUrls, revokeImageUrls } from "./image_cache.js";
import {
  createWorkflowId,
  getProjectRootBinding,
  removeWorkflow,
  renameProjectBindings,
  replacePathPrefix,
  setCurrentWorkflowId,
  setProjectRootBinding,
} from "./library.js";
import {
  DEFAULT_SETTINGS,
  IDLE_RUN,
  clearPendingDoc,
  healInterruptedNodes,
  readPendingDoc,
  reconcilePendingDoc,
  scheduleSave,
} from "./persistence.js";
import { buildRoomSnapshot } from "../collab/room_snapshot.js";
import { downloadJson } from "../download.js";
import { stopCollabSession } from "../collab/session-lifecycle.js";
import {
  buildVooFile,
  hydrateVooImages,
  readRequiredAsset,
} from "./project_io.js";
import {
  createEmptyProjectBrief,
  migrateProjectBrief,
} from "../agent-runtime/project-brief.js";
import {
  createEmptyProjectMemory,
  migrateProjectMemory,
} from "../agent-runtime/project-memory.js";
import { scheduleAutomaticWorkflowRecovery } from "../agent-runtime/durable-recovery-scheduler.js";
import {
  isCommitted,
  persistenceResultFromError,
} from "../../shared/persistence_contract.js";

/** A document that exists nowhere in storage yet, so nothing can conflict. */
const UNSAVED_BASE = {
  name: "",
  nodes: [],
  edges: [],
  settings: {},
  projectBrief: createEmptyProjectBrief(),
  projectMemory: createEmptyProjectMemory(),
  roomId: null,
  roomCreatedAt: 0,
};

/** Workflow lifecycle actions kept separate from live graph editing actions. */
export function createWorkflowDocumentActions(set, get) {
  return {
    /**
     * Starts a fresh document. `dir` (desktop client) is the folder this
     * workflow autosaves into; `project` is the containing project folder when
     * the workflow is a session inside one, null for temporary sessions and
     * unbound workflows.
     */
    async createWorkflow(
      dir = null,
      project = null,
      // The workflow name is user-visible from the moment it is created, so
      // the default follows the active locale instead of a hardcoded English
      // literal (I18N-1).
      defaultName = t("app.untitled"),
      { starter = true } = {},
    ) {
      await scheduleSave(get, { immediate: true });
      const workflowId = createWorkflowId();
      setCurrentWorkflowId(workflowId);
      // A temporary session (dir set, project null) stays loose: it is not a
      // member of any project group.
      setProjectRootBinding(
        workflowId,
        dir ? { dir, project: project ?? null } : null,
      );
      const currentId = get().workflowId;
      const existingHistories = get().workflowHistories || {};
      const savedHistories = currentId
        ? {
            ...existingHistories,
            [currentId]: {
              undoStack: get().undoStack || [],
              redoStack: get().redoStack || [],
            },
          }
        : existingHistories;

      stopCollabSession();
      set({
        workflowId,
        roomId: null,
        roomCreatedAt: 0,
        shareLoading: false,
        shareError: null,
        lastShareUrl: null,
        collabBase: null,
        collabSession: null,
        collabReadOnly: false,
        readOnly: false,
        name: defaultName,
        projectBrief: createEmptyProjectBrief(),
        projectMemory: createEmptyProjectMemory(),
        nodes: [],
        edges: [],
        settings: { ...get().settings, starterInitialized: false },
        // Revisions are per document; the new one starts before its first write.
        rev: 0,
        projectRoot: dir ?? null,
        projectParent: dir ? (project ?? null) : null,
        syncBase: UNSAVED_BASE,
        run: IDLE_RUN,
        undoStack: [],
        redoStack: [],
        workflowHistories: {
          ...savedHistories,
          [workflowId]: { undoStack: [], redoStack: [] },
        },
        durableExecutionRecovery: { unfinished: [], failedNodeIds: [] },
        durableExecutionError: null,
      });
      // No host page means no chat-site target: null picks the starter's
      // VOO Cloud pipeline so the fresh workflow can run without a host.
      const platformId = get().platform?.id || null;
      // External MCP hosts populate their own workflow or Design document;
      // a demo Generate node would join full runs as an unintended task.
      if (starter) await get().ensureStarterNode(platformId);
    },

    async openWorkflow(id) {
      if (id === get().workflowId) return;
      await scheduleSave(get, { immediate: true });
      const stored = await loadWorkflow(id);
      if (!stored) return;
      // A refresh/close can kill the page before the debounced autosave lands;
      // replay the localStorage write-ahead so the last edits survive.
      const reconciled = await reconcilePendingDoc(id, stored);

      const { healed, edges, resumeFrom } = healInterruptedNodes(
        reconciled?.nodes ?? [],
        reconciled?.edges ?? [],
      );
      const settings = { ...DEFAULT_SETTINGS, ...(reconciled?.settings ?? {}) };
      setCurrentWorkflowId(id);
      // The old workflow's object URLs die with it — nothing will render them.
      revokeImageUrls(get().images);
      const binding = getProjectRootBinding(id);

      const currentId = get().workflowId;
      const existingHistories = get().workflowHistories || {};
      const savedHistories = currentId
        ? {
            ...existingHistories,
            [currentId]: {
              undoStack: get().undoStack || [],
              redoStack: get().redoStack || [],
            },
          }
        : existingHistories;

      const nextHistory = savedHistories[id] || {
        undoStack: [],
        redoStack: [],
      };

      stopCollabSession();
      set({
        workflowId: id,
        roomId: reconciled?.roomId ?? null,
        roomCreatedAt: reconciled?.roomCreatedAt ?? 0,
        shareLoading: false,
        shareError: null,
        lastShareUrl: null,
        collabBase: null,
        collabSession: null,
        collabReadOnly: false,
        readOnly: false,
        name: reconciled?.name ?? "",
        projectBrief: migrateProjectBrief(reconciled?.projectBrief),
        projectMemory: migrateProjectMemory(reconciled?.projectMemory),
        nodes: healed,
        edges,
        settings,
        // The bound folders travel with the workflow, wherever it is reopened.
        projectRoot: binding?.dir ?? null,
        projectParent: binding?.project ?? null,
        // Image bytes hydrate after the swap; nodes show skeletons meanwhile.
        images: {},
        rev: reconciled?.rev ?? 0,
        syncBase: {
          name: reconciled?.name ?? "",
          nodes: reconciled?.nodes ?? [],
          edges: reconciled?.edges ?? [],
          settings,
          projectBrief: migrateProjectBrief(reconciled?.projectBrief),
          projectMemory: migrateProjectMemory(reconciled?.projectMemory),
          roomId: reconciled?.roomId ?? null,
          roomCreatedAt: reconciled?.roomCreatedAt ?? 0,
        },
        run: { ...IDLE_RUN, resumeFrom },
        undoStack: nextHistory.undoStack,
        redoStack: nextHistory.redoStack,
        workflowHistories: savedHistories,
      });
      try {
        await get().refreshDurableExecutionRecovery(id);
      } catch (error) {
        set({ durableExecutionError: error?.message ?? String(error) });
      }
      void get().hydrateDocumentImages(id, referencedImageIds(healed));
      scheduleAutomaticWorkflowRecovery({ get, set, workflowId: id });
    },

    async deleteWorkflow(id) {
      const isCurrent = id === get().workflowId;
      const pending = readPendingDoc(id);
      if (pending?.workflowId === id) {
        clearPendingDoc(id);
      }
      setProjectRootBinding(id, null);
      await removeWorkflow(
        id,
        workflowAssetRetentionNodes(get(), { excludeWorkflowId: id }),
      );
      const existingHistories = get().workflowHistories;
      if (existingHistories && existingHistories[id]) {
        delete existingHistories[id];
      }
      await get().refreshLibrary();
      if (!isCurrent) return;

      stopCollabSession();
      set({
        workflowId: null,
        roomId: null,
        roomCreatedAt: 0,
        shareLoading: false,
        shareError: null,
        lastShareUrl: null,
        collabBase: null,
        collabSession: null,
        collabReadOnly: false,
        readOnly: false,
      });
      const next = get().library.find((item) => item.id !== id);
      if (next) await get().openWorkflow(next.id);
      else await get().createWorkflow();
    },

    async renameWorkflow(id, name) {
      if (id === get().workflowId) {
        // setName only schedules the debounced autosave, so a picker that
        // reloads its rows right after this call could still read the old
        // name. A user-committed rename is a discrete action: flush it now so
        // the stored document matches the row the moment this resolves.
        get().setName(name);
        await scheduleSave(get, { immediate: true });
        return;
      }
      const stored = await loadWorkflow(id);
      if (!stored) return;
      await saveWorkflow({ ...stored, name });
      await get().refreshLibrary();
    },

    renameProject(oldPath, newPath) {
      renameProjectBindings(oldPath, newPath);
      const { projectParent, projectRoot } = get();
      const updates = {};
      if (projectParent) {
        const nextParent = replacePathPrefix(projectParent, oldPath, newPath);
        if (nextParent !== projectParent) updates.projectParent = nextParent;
      }
      if (projectRoot) {
        const nextRoot = replacePathPrefix(projectRoot, oldPath, newPath);
        if (nextRoot !== projectRoot) updates.projectRoot = nextRoot;
      }
      if (Object.keys(updates).length > 0) {
        set(updates);
      }
    },

    async moveWorkflowToProject(id, targetProject) {
      if (!id) return;
      const binding = getProjectRootBinding(id);
      const nextProject = targetProject || null;
      if (nextProject) {
        setProjectRootBinding(id, {
          dir: binding?.dir ?? null,
          project: nextProject,
        });
      } else {
        setProjectRootBinding(id, null);
      }
      if (get().workflowId === id) {
        set({ projectParent: nextProject });
        await scheduleSave(get, { immediate: true });
        await get().refreshLibrary();
        return;
      }
      const stored = await loadWorkflow(id);
      if (stored) {
        await saveWorkflow({ ...stored, project: nextProject });
      }
      await get().refreshLibrary();
    },

    async exportWorkflow() {
      const { name, nodes, edges } = get();
      const used = referencedImageIds(nodes);
      const remoteImages = {};
      nodes.forEach((node) => {
        Object.assign(remoteImages, node.data?.remoteAssetUrls ?? {});
      });
      // Export only portable HTTPS references. Large local Base64 payloads made
      // shared workflows enormous and caused API requests to stall.
      return {
        version: 2,
        name,
        nodes: stripTransientNodeState(nodes),
        edges,
        images: Object.fromEntries(
          [...used]
            .filter((imageId) => remoteImages[imageId])
            .map((imageId) => [imageId, remoteImages[imageId]]),
        ),
      };
    },

    /**
     * Exports a self-contained snapshot of the current document with every
     * referenced image embedded as a data URL, and downloads it. Intended for
     * collab rooms (plan 2.6): the room's document lives only in members'
     * IndexedDB, so a snapshot is the one durable copy that survives a
     * browser-data wipe or a long offline fork.
     */
    async exportRoomSnapshot() {
      const { name, nodes, edges } = get();
      const used = referencedImageIds(nodes);
      const images = {};
      try {
        for (const id of used) images[id] = await readRequiredAsset(id);
      } catch (error) {
        get().setSaveError(
          error?.code === "asset-unavailable"
            ? "projectAssetUnavailable"
            : true,
        );
        throw error;
      }
      const snapshot = buildRoomSnapshot({ name, nodes, edges, images });
      downloadJson(snapshot, name ? `room-${name}` : "room-snapshot");
      return snapshot;
    },

    /**
     * Binds the open collaborative workflow to a desktop project folder.
     * The normal immediate save then mirrors the same document and image
     * payload through writeWorkflowJson; no collab-specific disk protocol is
     * needed.
     */
    async saveRoomSessionToProjectFolder() {
      const desktop = globalThis.window?.vooElectron ?? globalThis.vooElectron;
      const chooseFolder = desktop?.project?.chooseFolder;
      if (!chooseFolder || !desktop?.writeWorkflowJson) {
        return false;
      }
      const folder = await chooseFolder();
      if (!folder) return false;
      const { workflowId } = get();
      if (!workflowId) return false;
      setProjectRootBinding(workflowId, { dir: folder, project: folder });
      set({ projectRoot: folder, projectParent: folder });
      await scheduleSave(get, { immediate: true });
      return true;
    },

    async importWorkflow(document) {
      await scheduleSave(get, { immediate: true });
      const nodes = migrateNodes(document.nodes ?? [], document.edges ?? []);
      const edges = pruneOrphanEdges(nodes, document.edges ?? []);
      const remoteImages = Object.fromEntries(
        Object.entries(document.images ?? {}).filter(([, value]) =>
          /^https:\/\//i.test(value),
        ),
      );
      const legacyEntries = Object.entries(document.images ?? {}).filter(
        ([, value]) => /^data:/i.test(value),
      );
      const downloadedEntries = await Promise.all(
        Object.entries(remoteImages).map(async ([id, url]) => [
          id,
          (await fetchAssetDataUrl({ url, maxBytes: 128 * 1024 * 1024 }))
            .dataUrl,
        ]),
      );
      const entries = [...legacyEntries, ...downloadedEntries];
      await putImages(entries);
      const hydratedNodes = nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          remoteAssetUrls: {
            ...(node.data?.remoteAssetUrls ?? {}),
            ...remoteImages,
          },
        },
      }));
      const workflowId = createWorkflowId();
      setCurrentWorkflowId(workflowId);
      const currentId = get().workflowId;
      const existingHistories = get().workflowHistories || {};
      const savedHistories = currentId
        ? {
            ...existingHistories,
            [currentId]: {
              undoStack: get().undoStack || [],
              redoStack: get().redoStack || [],
            },
          }
        : existingHistories;

      stopCollabSession();
      set({
        workflowId,
        shareLoading: false,
        shareError: null,
        lastShareUrl: null,
        collabBase: null,
        collabSession: null,
        collabReadOnly: false,
        readOnly: false,
        name: document.name ?? "",
        projectBrief: migrateProjectBrief(document.projectBrief),
        projectMemory: migrateProjectMemory(document.projectMemory),
        roomId: document.roomId ?? null,
        roomCreatedAt: document.roomCreatedAt ?? 0,
        nodes: hydratedNodes,
        edges,
        images: mergeBlobsAsUrls(
          get().images,
          await getImageBlobMap(entries.map(([id]) => id)),
        ),
        settings: {
          ...get().settings,
          ...(document.settings ?? {}),
          starterInitialized: true,
        },
        rev: 0,
        syncBase: UNSAVED_BASE,
        run: IDLE_RUN,
        undoStack: [],
        redoStack: [],
        workflowHistories: {
          ...savedHistories,
          [workflowId]: { undoStack: [], redoStack: [] },
        },
      });
      await scheduleSave(get, { immediate: true });
    },

    /**
     * Saves the whole workflow plus every picture-editor document into a
     * folder the user picked: workflow.json at the root (with the local
     * images embedded as data URLs, unlike the portable export) and a `voo/`
     * subfolder holding one `.voo` file per editor node.
     */
    async exportProjectToFolder() {
      const bridge = window.vooElectron?.project;
      if (!bridge) return false;
      const folder = await bridge.chooseFolder();
      if (!folder) return false;
      const {
        name,
        nodes,
        edges,
        settings,
        projectBrief,
        projectMemory,
        roomId,
        roomCreatedAt,
      } = get();
      const used = new Set(referencedImageIds(nodes));
      if (projectBrief?.brand?.logoAssetId) {
        used.add(projectBrief.brand.logoAssetId);
      }
      for (const id of projectBrief?.references ?? []) used.add(id);
      const images = {};
      let vooFiles;
      try {
        for (const id of used) images[id] = await readRequiredAsset(id);
        vooFiles = {};
        for (const node of nodes) {
          if (
            (node.type === NODE_TYPE.IMAGE_EDITOR ||
              node.type === NODE_TYPE.PREVIEW) &&
            node.data?.editorDoc
          ) {
            vooFiles[`${node.id}.voo`] = await buildVooFile({
              document: node.data.editorDoc,
            });
          }
        }
      } catch (error) {
        get().setSaveError(
          error?.code === "asset-unavailable"
            ? "projectAssetUnavailable"
            : true,
        );
        return false;
      }
      const workflow = {
        version: 2,
        name,
        nodes: stripTransientNodeState(nodes),
        edges,
        images,
        settings,
        projectBrief,
        projectMemory,
        roomId: roomId ?? null,
        roomCreatedAt: roomCreatedAt ?? 0,
      };
      // This is a user-initiated save: the outcome must be interpreted by the
      // persistence contract (R1–R3). The main process returns contract
      // result objects; an invoke that rejects without one means the answer
      // was lost on the wire, which the contract maps to uncertain.
      let outcome;
      try {
        outcome = await bridge.write(folder, { workflow, vooFiles });
      } catch (error) {
        outcome = persistenceResultFromError(error);
      }
      if (!isCommitted(outcome)) {
        // Failed and uncertain both light the save-error affordance — the one
        // thing a user-initiated save may never do is fail silently.
        get().setSaveError(true);
        return false;
      }
      const { workflowId } = get();
      if (workflowId) {
        setProjectRootBinding(workflowId, { dir: folder, project: folder });
      }
      set({ projectRoot: folder, projectParent: folder });
      return true;
    },

    /**
     * Opens a project folder: the workflow plus every `.voo` document it
     * references, hydrated into IndexedDB. The workflow comes in as a normal
     * import; each `.voo` then re-attaches its editor document to the node
     * named after the file.
     */
    async importProjectFromFolder() {
      const bridge = window.vooElectron?.project;
      if (!bridge) return false;
      const folder = await bridge.chooseFolder();
      if (!folder) return false;
      const { workflow, vooFiles } = await bridge.read(folder);
      const sourceNodes = workflow?.nodes ?? get().nodes;
      const byId = new Map(sourceNodes.map((node) => [node.id, node]));
      const editorFiles = [];
      for (const [name, vooFile] of Object.entries(vooFiles ?? {})) {
        const nodeId = name.replace(/\.voo$/, "");
        const node = byId.get(nodeId);
        if (
          !node ||
          (node.type !== NODE_TYPE.IMAGE_EDITOR &&
            node.type !== NODE_TYPE.PREVIEW)
        )
          continue;
        editorFiles.push([nodeId, vooFile]);
      }
      const rollback = editorFiles.length
        ? await hydrateVooImages(editorFiles.map(([, file]) => file))
        : null;
      try {
        if (workflow) await get().importWorkflow(workflow);
        for (const [nodeId, file] of editorFiles) {
          get().updateNodeData(nodeId, { editorDoc: file.document });
        }
      } catch (error) {
        if (rollback) {
          try {
            await rollback();
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              "project-import-rollback-failed",
            );
          }
        }
        throw error;
      }
      const { workflowId } = get();
      if (workflowId) {
        setProjectRootBinding(workflowId, { dir: folder, project: folder });
      }
      set({ projectRoot: folder, projectParent: folder });
      return true;
    },
  };
}
