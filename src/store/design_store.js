import { forgetPageCamera, pageCameraCache } from "../canvas/page_camera.js";
import { createCameraRafBatcher } from "../canvas/camera_raf.js";
import { create } from "zustand";
import { createDocument, CANVAS_TYPE } from "../canvas/editor/scene_doc_factory.js";
import { addRecentFile } from "../canvas/store/recent_files.js";
import { guessCategory } from "../services/workspace_storage.js";
import { saveCrashDraft } from "../shared/crash_recovery.js";

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

let pageCounter = 0;

export const useDesignStore = create((set, get) => {
  const cameraBatcher = createCameraRafBatcher({
    getCamera: () => get().editorCamera,
    setCamera: (editorCamera) => set({ editorCamera }),
    requestAnimationFrame: (callback) => typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame(callback) : callback(),
  });
  return {
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
  // Label of the document being opened, or null. While set, the whole app sits
  // behind a loading overlay so a half-imported document never shows.
  documentLoading: null,
  filePath: null,
  fileHandle: null,
  fileName: "Untitled.voo",
  canvasBackgroundColor: "#1e1e1e",
  setCanvasBackgroundColor: (color) => set({ canvasBackgroundColor: color, isDirty: true }),
  /** The Figma envelope a `.fig` was opened from; saving writes back in the same schema. */
  figSource: null,
  isDirty: false,

  // Agent Panel & Hybrid Architecture State
  agentPanelOpen: false,
  pendingAgentIntent: null,

  editorPageCameras: {},
  pendingArtboardFitId: null,
  editorPageSession: 0,

  // Page / Artboard actions
  focusEditorPage: (id, { rememberCamera = get().editingNodeIds.length > 1 || Boolean(get().editingPresentationId) } = {}) => {
    if (!id || !get().nodes.some((node) => node.id === id) || id === get().editingNodeId) return;
    cameraBatcher.flush();
    set((state) => ({
      editorPageCameras: { ...state.editorPageCameras, ...(rememberCamera && state.editingNodeId ? { [state.editingNodeId]: { ...state.editorCamera } } : {}) },
      editorCamera: state.editorPageCameras[id] || state.editorCamera,
      pendingArtboardFitId: state.editorPageCameras[id] ? null : id,
      editingNodeId: id,
      // A page the canvas does not show yet replaces what is on it, so the switcher brings it in.
      editingNodeIds: state.editingNodeIds.includes(id) ? state.editingNodeIds : [id],
    }));
  },

  addEditorPage: ({ label = "Untitled", canvasType = CANVAS_TYPE.DESIGN, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) => {
    // Capture the outgoing mode before adding a second visible page.
    // Local page cameras live in page_camera.js, not editorCamera.
    const rememberCamera = get().editingNodeIds.length > 1 || Boolean(get().editingPresentationId);
    const id = `page-${Date.now().toString(36)}-${(++pageCounter).toString(36)}`;
    const newPage = {
      id,
      type: "imageEditor",
      position: { x: 0, y: 0 },
      data: {
        label,
        canvasType,
        editorDoc: createDocument(width, height, "#171717", { canvasType, canvasId: id }),
      },
    };
    set((state) => ({
      nodes: [...state.nodes, newPage],
      editingNodeIds: [...state.editingNodeIds, id],
      isDirty: true,
    }));
    get().focusEditorPage(id, { rememberCamera });
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
    const rememberCamera = state.editingNodeIds.length > 1 || Boolean(state.editingPresentationId);
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
      editingNodeIds: [...s.editingNodeIds, newId],
      isDirty: true,
    }));
    get().focusEditorPage(newId, { rememberCamera });
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
  setWelcomeOpen: (welcomeOpen) => set({ welcomeOpen }),
  setDocumentLoading: (documentLoading) => set({ documentLoading }),

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
    cameraBatcher.flush();
    set({ figSource, editorPageCameras: {}, pendingArtboardFitId: null, editorPageSession: get().editorPageSession + 1 });

    if (Array.isArray(doc.pages) && doc.pages.length > 0) {
      const nextNodes = doc.pages.map((page, idx) => ({
        id: page.id || `page-${Date.now().toString(36)}-${idx}`,
        type: "imageEditor",
        position: { x: 0, y: 0 },
        data: {
          label: page.label || `Design ${idx + 1}`,
          canvasType: page.canvasType || CANVAS_TYPE.DESIGN,
          editorDoc: page.sceneDoc || page.document || createDocument(DEFAULT_WIDTH, DEFAULT_HEIGHT, "#171717"),
        },
      }));
      const nextIds = nextNodes.map((n) => n.id);
      const nextFocused = doc.editingNodeId && nextIds.includes(doc.editingNodeId) ? doc.editingNodeId : nextIds[0];
      set({
        nodes: nextNodes,
        // Only the focused page is on the canvas; the page switcher brings the others in.
        editingNodeIds: [nextFocused],
        editingNodeId: nextFocused,
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
          editorDoc: doc,
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
        editorPageCameras: {}, pendingArtboardFitId: null,
        filePath,
        fileName,
        fileHandle,
        isDirty: false,
        welcomeOpen: false,
      });
    }
  },

  newVooProject: ({ label = "Design 1", width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, canvasType = CANVAS_TYPE.DESIGN } = {}) => {
    const pageId = `page-${Date.now().toString(36)}`;
    const page = {
      id: pageId,
      type: "imageEditor",
      position: { x: 0, y: 0 },
      data: {
        label,
        canvasType,
        editorDoc: createDocument(width, height, "#171717", { canvasType, canvasId: pageId }),
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

  closeProject: () => {
    set({
      welcomeOpen: true,
      fileName: null,
      filePath: null,
      fileHandle: null,
      isDirty: false,
      nodes: [],
      editingNodeId: null,
      editingNodeIds: [],
      editingGroupId: null,
    });
  },

  closeImageEditor: () => {
    set({ welcomeOpen: true });
  },

  applyImageEdits: () => {
    set({ isDirty: false });
  },

  materializeEditorGeneratedOutput: () => {},

  // Agent Panel & Hybrid Architecture Actions
  setAgentPanelOpen: (agentPanelOpen) =>
    set({ agentPanelOpen: Boolean(agentPanelOpen) }),
  setAgentOpen: (agentOpen) =>
    set({ agentPanelOpen: Boolean(agentOpen) }),
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
  };
});

export default useDesignStore;
