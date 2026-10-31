import { WORKSPACE_BACKGROUND } from "../canvas/editor/render_canvas_base.js";
import { forgetPageCamera, pageCameraCache } from "../canvas/page_camera.js";
import { createCameraRafBatcher } from "../canvas/camera_raf.js";
import { create } from "zustand";
import { createDocument, CANVAS_TYPE } from "../canvas/editor/scene_doc_factory.js";
import { promoteFixedPageToFrame } from "../canvas/editor/page_to_canvas_root.js";
import { addRecentFile } from "../canvas/store/recent_files.js";
import { guessCategory } from "../services/workspace_storage.js";
import { saveCrashDraft } from "../shared/crash_recovery.js";
import { createShareActions } from "../canvas/store/share_actions.js";

const DEFAULT_PAGE_ID = "page-1";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

function createDefaultPage(id = DEFAULT_PAGE_ID, label = "Design 1", canvasType = CANVAS_TYPE.DESIGN) {
  return {
    id,
    type: "imageEditor",
    position: { x: 0, y: 0 },
    data: {
      label,
      canvasType,
      editorDoc: createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT, "#171717", {
        canvasType,
        canvasId: id,
      }),
    },
  };
}

// Session snapshots are intentionally separate from on-disk project serialization.
const DOCUMENT_FIELDS = [
  "nodes", "edges", "images", "editingNodeId", "editingNodeIds", "editingGroupId",
  "editorCamera", "editorArtboardLayouts", "editorPageCameras", "editorPageSession",
  "pendingArtboardFitId", "filePath", "fileHandle", "fileName", "figSource",
  "isDirty", "canvasBackgroundColor", "editingPresentationId",
];
let documentCounter = 0;
function documentSnapshot(state) {
  const snapshot = Object.fromEntries(DOCUMENT_FIELDS.map(key => [key, state[key]]));
  snapshot.nodes = state.nodes.map(node => {
    const doc = state.editorPageDocumentReader?.(node.id);
    return doc ? { ...node, data: { ...node.data, editorDoc: doc } } : node;
  });
  return snapshot;
}

let pageCounter = 0;

export const useDesignStore = create((set, get) => {
  const cameraBatcher = createCameraRafBatcher({
    getCamera: () => get().editorCamera,
    setCamera: (editorCamera) => set({ editorCamera }),
    requestAnimationFrame: (callback) => typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame(callback) : callback(),
  });
  return {
  ...createShareActions(set, get),
  // No document is open at startup: the welcome page owns the screen and the
  // first New/Open creates the first tab (same state as after closing the last tab).
  activeDocumentId: null,
  openDocuments: [],
  suspendDocument: () => {
    cameraBatcher.flush();
    const state = get();
    if (!state.activeDocumentId) return;
    const snapshot = documentSnapshot(state);
    set({ openDocuments: state.openDocuments.map(doc => doc.id === state.activeDocumentId ? { id: doc.id, ...snapshot } : doc) });
  },
  beginDocument: () => {
    get().suspendDocument();
    const id = `document-${++documentCounter}`;
    set(state => ({ activeDocumentId: id, openDocuments: [...state.openDocuments, { id }],
      edges: [], images: {}, figSource: null, canvasBackgroundColor: WORKSPACE_BACKGROUND,
      streamingPreview: null, streamingPreviewNodeId: null }));
  },
  switchDocument: (id) => {
    if (id === get().activeDocumentId) { set({ welcomeOpen: false }); return; }
    if (!get().openDocuments.some(doc => doc.id === id)) return;
    get().suspendDocument();
    const doc = get().openDocuments.find(doc => doc.id === id);
    set({ ...Object.fromEntries(DOCUMENT_FIELDS.map(key => [key, doc[key]])), activeDocumentId: id, welcomeOpen: false,
      streamingPreview: null, streamingPreviewNodeId: null });
  },
  closeDocument: (id, confirmClose = () => true) => {
    const state = get();
    const doc = id === state.activeDocumentId ? state : state.openDocuments.find(doc => doc.id === id);
    if (!doc || (doc.isDirty && !confirmClose())) return false;
    if (id === state.activeDocumentId) {
      const next = state.openDocuments.filter(doc => doc.id !== id);
      if (next.length) get().switchDocument(next[next.length - 1].id);
      else set({ activeDocumentId: null, welcomeOpen: true, nodes: [], editingNodeId: null, editingNodeIds: [], fileName: null, filePath: null, fileHandle: null, isDirty: false });
    }
    set(state => ({ openDocuments: state.openDocuments.filter(doc => doc.id !== id) }));
    return true;
  },
  // Core state
  editingNodeId: DEFAULT_PAGE_ID,
  editingNodeIds: [DEFAULT_PAGE_ID],
  editingGroupId: null,
  nodes: [createDefaultPage()],
  edges: [],
  images: {},
  editorCamera: { panX: 0, panY: 0, zoom: 1 },
  editorArtboardLayouts: {
    [DEFAULT_PAGE_ID]: { x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
  },
  streamingPreview: null,
  streamingPreviewNodeId: null,
  welcomeOpen: true,
  welcomeActionsReady: false,
  // Label of the document being opened, or null. While set, the whole app sits
  // behind a loading overlay so a half-imported document never shows.
  documentLoading: null,
  filePath: null,
  fileHandle: null,
  fileName: "Untitled.voo",
  canvasBackgroundColor: WORKSPACE_BACKGROUND,
  setCanvasBackgroundColor: (color) => set({ canvasBackgroundColor: color, isDirty: true }),
  /** The Figma envelope a `.fig` was opened from; saving writes back in the same schema. */
  figSource: null,
  isDirty: false,

  // Agent Panel & Hybrid Architecture State
  agentPanelOpen: false,
  browserDrawerOpen: false,
  pendingAgentIntent: null,
  // One-shot handoff from the welcome composer: prompt + frame + style + model +
  // references. The agent panel claims it exactly once (see pending_agent_intent).
  pendingGeneration: null,

  editorPageCameras: {},
  pendingArtboardFitId: null,
  editorPageSession: 0,

  // Page / Artboard actions
  focusEditorPage: (id, { rememberCamera = true, exclusive = false } = {}) => {
    const current = get();
    if (!id || !current.nodes.some((node) => node.id === id)) return;
    if (id === current.editingNodeId) {
      if (exclusive && current.editingNodeIds.length !== 1) {
        set({ editingNodeIds: [id] });
      }
      return;
    }
    cameraBatcher.flush();
    set((state) => ({
      editorPageCameras: { ...state.editorPageCameras, ...(rememberCamera && state.editingNodeId ? { [state.editingNodeId]: { ...state.editorCamera } } : {}) },
      editorCamera: state.editorPageCameras[id] || state.editorCamera,
      pendingArtboardFitId: state.editorPageCameras[id] ? null : id,
      editingNodeId: id,
      // A page the canvas does not show yet replaces what is on it, so the switcher brings it in.
      editingNodeIds: exclusive ? [id] : state.editingNodeIds.includes(id) ? state.editingNodeIds : [id],
    }));
  },

  openExistingEditorPage: (id) => {
    const state = get();
    if (!state.nodes.some(node => node.id === id && node.type === "imageEditor")) return false;
    set({ editingNodeIds: state.editingNodeIds.includes(id) ? state.editingNodeIds : [...state.editingNodeIds, id], welcomeOpen: false });
    get().focusEditorPage(id, { rememberCamera: true });
    return true;
  },

  addEditorPage: ({ label = "Untitled", canvasType = CANVAS_TYPE.DESIGN, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) => {
    // Page cameras live in page_camera.js; switching pages keeps each view.
    const rememberCamera = true;
    const id = `page-${Date.now().toString(36)}-${(++pageCounter).toString(36)}`;
    const editorDoc = createDocument(width, height, "transparent", {
      canvasType,
      canvasId: id,
    });
    editorDoc.isCanvasRoot = true;
    const newPage = {
      id,
      type: "imageEditor",
      position: { x: 0, y: 0 },
      data: {
        label,
        canvasType,
        editorDoc,
      },
    };
    set((state) => ({
      nodes: [...state.nodes, newPage],
      editingNodeIds: [id],
      isDirty: true,
    }));
    get().focusEditorPage(id, { rememberCamera, exclusive: true });
    return id;
  },

  deleteEditorPage: (id) => {
    if (!get().nodes.some((node) => node.id === id)) return;
    cameraBatcher.flush();
    forgetPageCamera(pageCameraCache(get().editorPageSession), id);
    set((state) => {
      const nextIds = state.editingNodeIds.filter((pId) => pId !== id);
      const nextNodes = state.nodes.filter((n) => n.id !== id);
      const nextFocused = state.editingNodeId === id ? (nextIds[0] || nextNodes[0]?.id || null) : state.editingNodeId;
      const { [id]: removedCamera, ...editorPageCameras } = state.editorPageCameras;
      const { [id]: removedLayout, ...editorArtboardLayouts } = state.editorArtboardLayouts;
      return {
        editingNodeIds: nextIds.length ? nextIds : (nextFocused ? [nextFocused] : []),
        editorPageCameras,
        editorArtboardLayouts,
        editorCamera: state.editingNodeId === id ? (editorPageCameras[nextFocused] || state.editorCamera) : state.editorCamera,
        pendingArtboardFitId: state.editingNodeId === id ? (editorPageCameras[nextFocused] ? null : nextFocused) : state.pendingArtboardFitId,
        nodes: nextNodes,
        editingNodeId: nextFocused,
        isDirty: true,
      };
    });
  },

  editorPageDocumentReader: null,

  duplicateEditorPage: (sourceId, { copySuffix = "Copy", defaultLabel = "Page" } = {}) => {
    const state = get();
    const sourceNode = state.nodes.find((n) => n.id === sourceId);
    if (!sourceNode) return null;
    const rememberCamera = true;
    const newId = `page-${Date.now().toString(36)}-${(++pageCounter).toString(36)}`;
    const duplicatedNode = {
      ...sourceNode,
      id: newId,
      data: {
        ...sourceNode.data,
        label: `${sourceNode.data?.label || defaultLabel} ${copySuffix}`,
        editorDoc: JSON.parse(JSON.stringify(state.editorPageDocumentReader?.(sourceId) ?? sourceNode.data?.editorDoc ?? sourceNode.data?.sceneDoc ?? {})),
      },
    };
    set((s) => ({
      nodes: [...s.nodes, duplicatedNode],
      editingNodeIds: [newId],
      isDirty: true,
    }));
    get().focusEditorPage(newId, { rememberCamera, exclusive: true });
    return newId;
  },

  renameEditorPage: (id, name) => {
    name = String(name ?? "").trim();
    if (!name || !get().nodes.some((node) => node.id === id && node.data?.label !== name)) return;
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label: name } } : n
      ),
      isDirty: true,
    }));
  },

  reorderEditorPage: (id, direction) => {
    set((state) => {
      const index = state.nodes.findIndex((node) => node.id === id);
      const target = index + direction;
      if (index < 0 || ![-1, 1].includes(direction) || target < 0 || target >= state.nodes.length) return state;
      const nodes = [...state.nodes];
      [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
      return { nodes, isDirty: true };
    });
  },

  updateNodeData: (id, partialData) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...partialData } } : n
      ),
      isDirty: true,
    }));
  },

  // Viewport / Camera actions
  setEditorCamera: (camera) => {
    cameraBatcher.flush();
    set((state) => ({
      editorCamera: {
        ...state.editorCamera,
        ...(typeof camera === "function" ? camera(state.editorCamera) : camera),
      },
    }));
  },

  panEditorCamera: (arg1, arg2) => {
    const { dx, dy } =
      typeof arg1 === "object" && arg1 !== null
        ? { dx: Number(arg1.dx) || 0, dy: Number(arg2?.dy ?? arg1.dy) || 0 }
        : { dx: Number(arg1) || 0, dy: Number(arg2) || 0 };
    cameraBatcher.pan(dx, dy);
  },

  setEditorViewport: ({ panX, panY, zoom }) => {
    set((state) => ({
      editorCamera: {
        panX: panX !== undefined ? panX : state.editorCamera.panX,
        panY: panY !== undefined ? panY : state.editorCamera.panY,
        zoom: zoom !== undefined ? zoom : state.editorCamera.zoom,
      },
    }));
  },

  setEditorArtboardLayout: (id, layout) => {
    set((state) => {
      const current = (state.editorArtboardLayouts instanceof Map
        ? state.editorArtboardLayouts.get(id)
        : state.editorArtboardLayouts?.[id]) || {};
      const layoutsObj = state.editorArtboardLayouts instanceof Map
        ? Object.fromEntries(state.editorArtboardLayouts)
        : { ...(state.editorArtboardLayouts || {}) };
      return {
        editorArtboardLayouts: {
          ...layoutsObj,
          [id]: { ...current, ...layout },
        },
      };
    });
  },

  setEditorArtboardLayouts: (layouts) => {
    const layoutObj = layouts instanceof Map ? Object.fromEntries(layouts) : layouts;
    set({ editorArtboardLayouts: layoutObj });
  },

  moveEditorArtboard: (id, payload = {}) => {
    set((state) => {
      const current = (state.editorArtboardLayouts instanceof Map
        ? state.editorArtboardLayouts.get(id)
        : state.editorArtboardLayouts?.[id]) || { x: 0, y: 0 };
      const nextX = payload.x !== undefined ? payload.x : (current.x || 0) + (payload.dx || 0);
      const nextY = payload.y !== undefined ? payload.y : (current.y || 0) + (payload.dy || 0);
      const layoutsObj = state.editorArtboardLayouts instanceof Map
        ? Object.fromEntries(state.editorArtboardLayouts)
        : { ...(state.editorArtboardLayouts || {}) };
      return {
        editorArtboardLayouts: {
          ...layoutsObj,
          [id]: { ...current, x: Math.round(nextX), y: Math.round(nextY) },
        },
      };
    });
  },

  getGroupCamera: () => get().editorCamera,
  saveGroupCamera: (_, camera) => set({ editorCamera: camera }),

  // Image storage in memory state
  putImageState: (id, dataUrl) => {
    set((state) => ({
      images: { ...state.images, [id]: dataUrl },
    }));
  },

  // Document file & dirty state
  setFileName: (fileName) => set({ fileName }),
  setFilePath: (filePath) => set({ filePath }),
  setFileHandle: (fileHandle) => set({ fileHandle }),
  setIsDirty: (isDirty) => set({ isDirty }),
  // With no open document there is no canvas to go back to, so the welcome page stays.
  setWelcomeOpen: (welcomeOpen) => set(state => (!welcomeOpen && !state.activeDocumentId ? {} : { welcomeOpen })),
  setDocumentLoading: (documentLoading) => set({ documentLoading }),
  setStreamingPreview: (streamingPreview, streamingPreviewNodeId = null) => {
    const state = get();
    const update = { streamingPreview, streamingPreviewNodeId };
    if (streamingPreview && state.welcomeOpen) {
      if (!state.activeDocumentId) {
        get().beginDocument();
      }
      update.welcomeOpen = false;
    }
    set(update);
  },

  restoreCrashDraft: (draft) => {
    if (!draft?.document) return;
    get().loadVooProject({ vooData: { document: draft.document, kind: draft.document.canvasType }, fileName: draft.label || "Untitled.voo" });
    set({ isDirty: true, editingGroupId: null, images: {}, streamingPreview: null, streamingPreviewNodeId: null });
  },

  // Structure-only crash draft (no image bytes) for unexpected-exit recovery.
  saveEditorDrafts: async () => {
    const state = get();
    const focused = state.editingNodeId;
    const node = (state.nodes || []).find((n) => n.id === focused);
    const doc = node?.data?.editorDoc;
    if (!focused || !doc) return;
    const { images: _images, ...safeDoc } = doc;
    await saveCrashDraft(focused, safeDoc, {
      label: state.fileName || node?.data?.label || "",
    });
  },

  loadVooProject: ({ vooData, filePath = null, fileName = "Untitled.voo", fileHandle = null, figSource = null }) => {
    const doc = vooData?.document;
    if (!doc) return;
    get().beginDocument();
    cameraBatcher.flush();
    set({ figSource, canvasBackgroundColor: doc.canvasBackgroundColor ?? WORKSPACE_BACKGROUND, editorPageCameras: {}, pendingArtboardFitId: null, editorPageSession: get().editorPageSession + 1 });

    if (Array.isArray(doc.pages) && doc.pages.length > 0) {
      const nextNodes = doc.pages.map((page, idx) => ({
        id: page.id || `page-${Date.now().toString(36)}-${idx}`,
        type: "imageEditor",
        position: { x: 0, y: 0 },
        data: {
          label: page.label || `Design ${idx + 1}`,
          canvasType: page.canvasType || CANVAS_TYPE.DESIGN,
          editorDoc: promoteFixedPageToFrame(
            page.sceneDoc || page.document || createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT, "transparent"),
          ),
        },
      }));
      const nextIds = nextNodes.map((n) => n.id);
      const nextFocused = doc.editingNodeId && nextIds.includes(doc.editingNodeId) ? doc.editingNodeId : nextIds[0];
      set({
        nodes: nextNodes,
        // Pages are separate workspaces; only the current page is on stage.
        editingNodeIds: [nextFocused],
        editingNodeId: nextFocused,
        pendingArtboardFitId: nextFocused,
        editorArtboardLayouts: doc.editorArtboardLayouts || {},
        editorCamera: doc.editorCamera || { panX: 0, panY: 0, zoom: 1 },
        filePath,
        fileName,
        fileHandle,
        isDirty: false,
        welcomeOpen: false,
      });
    } else {
      const pageId = `page-${Date.now().toString(36)}`;
      const singleNode = {
        id: pageId,
        type: "imageEditor",
        position: { x: 0, y: 0 },
        data: {
          label: doc.label || "Design 1",
          canvasType: vooData.kind || CANVAS_TYPE.DESIGN,
          editorDoc: promoteFixedPageToFrame(doc),
        },
      };
      set({
        nodes: [singleNode],
        editingNodeIds: [pageId],
        editingNodeId: pageId,
        editorArtboardLayouts: {
          [pageId]: { x: 0, y: 0, width: doc.width || DEFAULT_WIDTH, height: doc.height || DEFAULT_HEIGHT },
        },
        editorCamera: { panX: 0, panY: 0, zoom: 1 },
        editorPageCameras: {}, pendingArtboardFitId: pageId,
        filePath,
        fileName,
        fileHandle,
        isDirty: false,
        welcomeOpen: false,
      });
    }
  },

  newVooProject: ({ label = "Design 1", width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, canvasType = CANVAS_TYPE.DESIGN } = {}) => {
    get().beginDocument();
    const pageId = `page-${Date.now().toString(36)}-${++pageCounter}`;
    const pageDoc = promoteFixedPageToFrame(
      createDocument(width, height, "#171717", { canvasType, canvasId: pageId }),
    );
    const page = {
      id: pageId,
      type: "imageEditor",
      position: { x: 0, y: 0 },
      data: {
        label,
        canvasType,
        editorDoc: pageDoc,
      },
    };
    const fileName = label.endsWith(".voo") ? label : `${label}.voo`;
    try {
      addRecentFile({
        name: fileName,
        path: null,
        isDraft: true,
        category: guessCategory(fileName),
      });
    } catch {
      // non-critical fallback
    }
    set({
      editingNodeId: pageId,
      editingNodeIds: [pageId],
      editingGroupId: null,
      nodes: [page],
      editorCamera: { panX: 0, panY: 0, zoom: 1 },
      editorPageCameras: {}, pendingArtboardFitId: null,
      editorPageSession: get().editorPageSession + 1,
      editorArtboardLayouts: {
        [pageId]: { x: 0, y: 0, width, height },
      },
      filePath: null,
      fileHandle: null,
      fileName,
      isDirty: false,
      welcomeOpen: false,
    });
  },

  closeProject: () => get().closeDocument(get().activeDocumentId),

  closeImageEditor: () => {
    set({ welcomeOpen: true });
  },

  applyImageEdits: () => {
    set({ isDirty: false });
  },

  materializeEditorGeneratedOutput: async ({ result } = {}) => {
    // Capture the originating tab before the optional materializer is loaded.
    const initial = get();
    const context = {
      documentId: initial.activeDocumentId,
      session: initial.editorPageSession,
      sourceId: result?.sourceWorkflowNodeId,
      focusedId: initial.editingNodeId,
    };
    const valid = (state) => Boolean(context.documentId && context.sourceId &&
      context.focusedId === context.sourceId &&
      state.activeDocumentId === context.documentId &&
      state.editorPageSession === context.session &&
      state.editingNodeId === context.focusedId &&
      state.nodes.some(node => node.id === context.sourceId && node.type === "imageEditor"));
    if (!valid(initial)) throw new Error("Generated output source is not active");
    let invalidated = false;
    const unsubscribe = useDesignStore.subscribe(state => {
      if (!valid(state)) invalidated = true;
    });
    const assertCurrent = () => {
      if (invalidated || !valid(get())) throw new Error("Generated output source changed");
    };
    try {
      const { materializeGeneratedOutput } = await import("./materialize-generated-output.js");
      assertCurrent();
      return await materializeGeneratedOutput({ result, context, get, set, assertCurrent });
    } finally {
      unsubscribe();
    }
  },

  // Agent Panel & Hybrid Architecture Actions
  setAgentPanelOpen: (agentPanelOpen) =>
    set({ agentPanelOpen: Boolean(agentPanelOpen) }),
  setAgentOpen: (agentOpen) =>
    set({ agentPanelOpen: Boolean(agentOpen) }),
  setBrowserDrawerOpen: (browserDrawerOpen) =>
    set({ browserDrawerOpen: Boolean(browserDrawerOpen) }),
  dispatchAgentIntent: ({
    prompt = "",
    action = "custom",
    node = null,
  } = {}) => {
    set({
      agentPanelOpen: true,
      pendingAgentIntent: {
        prompt: (prompt || "").trim(),
        action,
        node,
        timestamp: Date.now(),
      },
    });
  },
  dispatchToAgent: (payload) => {
    const prompt = (payload?.prompt || payload?.intent || "").trim();
    const action = payload?.tool || payload?.intent || "custom";
    const node = payload?.context || null;
    set({
      agentPanelOpen: true,
      pendingAgentIntent: {
        prompt,
        action,
        node,
        timestamp: Date.now(),
      },
    });
  },
  clearPendingAgentIntent: () => set({ pendingAgentIntent: null }),
  setPendingGeneration: (pendingGeneration) =>
    set({ agentPanelOpen: Boolean(pendingGeneration), pendingGeneration }),
  clearPendingGeneration: () => set({ pendingGeneration: null }),
  };
});

export default useDesignStore;
