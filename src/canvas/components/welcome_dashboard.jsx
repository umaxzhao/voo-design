import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  File,
  Star,
  Trash2,
  RotateCcw,
  Copy,
  Pencil,
  MoreHorizontal,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  X,
  Plus,
  FolderOpen,
  Globe,
  Smartphone,
  Monitor,
  Presentation,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";
import { useDesignStore } from "../../store/design_store.js";
import { openVooProject } from "../store/project_io.js";
import {
  getRecentFiles,
  getDrafts,
  getStarredFiles,
  getTrashFiles,
  addRecentFile,
  toggleStarFile,
  renameRecentFile,
  duplicateRecentFile,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
  emptyTrash,
} from "../store/recent_files.js";
import { migrateLegacyFolderMembership } from "../store/file_folders.js";
import { createDocument, CANVAS_TYPE } from "../editor/scene_doc_factory.js";
import { encodeVooBinary } from "../store/voo_binary.js";
import { useI18n } from "../use_i18n.js";
import {
  workspaceStorage,
  ElectronWorkspaceDriver,
  guessCategory,
} from "../../services/workspace_storage.js";
import CommunityTemplatesView from "./community_templates_view.jsx";
import { getSetting, setSetting } from "../../shared/settings.js";

// AI generation preset types for prompt composer
export const AI_GEN_TYPES = [
  {
    id: "landing",
    label: "welcome.pills.landing",
    placeholder: "welcome.prompt.landingPlaceholder",
    width: 1440,
    height: 900,
    type: CANVAS_TYPE.DESIGN,
    category: "landing",
    icon: Globe,
  },
  {
    id: "mobile",
    label: "welcome.pills.mobile",
    placeholder: "welcome.prompt.mobilePlaceholder",
    width: 393,
    height: 852,
    type: CANVAS_TYPE.DESIGN,
    category: "mobile",
    icon: Smartphone,
  },
  {
    id: "web",
    label: "welcome.pills.web",
    placeholder: "welcome.prompt.webPlaceholder",
    width: 1440,
    height: 900,
    type: CANVAS_TYPE.DESIGN,
    category: "web",
    icon: Monitor,
  },
  {
    id: "slides",
    label: "welcome.pills.slides",
    placeholder: "welcome.prompt.slidesPlaceholder",
    width: 1920,
    height: 1080,
    type: CANVAS_TYPE.DESIGN,
    category: "slides",
    icon: Presentation,
  },
  {
    id: "dashboard",
    label: "welcome.pills.dashboard",
    placeholder: "welcome.prompt.dashboardPlaceholder",
    width: 1440,
    height: 960,
    type: CANVAS_TYPE.DESIGN,
    category: "dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "other",
    label: "welcome.pills.other",
    placeholder: "welcome.prompt.otherPlaceholder",
    width: 1200,
    height: 800,
    type: CANVAS_TYPE.DESIGN,
    category: "other",
    icon: Sparkles,
  },
];

// Alias for backwards compatibility
export const CATEGORY_PILLS = AI_GEN_TYPES;

const SHORTCUTS_LIST = [
  { key: "⌘S / Ctrl+S", desc: "welcome.sc.save" },
  { key: "⌘⇧S / Ctrl+Shift+S", desc: "welcome.sc.saveAs" },
  { key: "⌘O / Ctrl+O", desc: "welcome.sc.open" },
  { key: "⌘N / Ctrl+N", desc: "welcome.sc.new" },
  { key: "V", desc: "welcome.sc.select" },
  { key: "P", desc: "welcome.sc.pen" },
  { key: "T", desc: "welcome.sc.text" },
  { key: "R / O", desc: "welcome.sc.rectEllipse" },
  { key: "welcome.sc.panKey", desc: "welcome.sc.pan" },
  { key: "welcome.sc.zoomKey", desc: "welcome.sc.zoom" },
  { key: "⌘Z / ⌘⇧Z", desc: "welcome.sc.undoRedo" },
  { key: "⌘G / ⌘⇧G", desc: "welcome.sc.group" },
];

export default function WelcomeDashboard() {
  const { t } = useI18n();

  // Navigation tabs: "recents" | "drafts" | "starred" | "trash" | "design-systems" | "shortcuts"
  const [activeTab, setActiveTab] = useState("recents");
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [activePill, setActivePill] = useState("landing");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt"); // "updatedAt" | "oldest" | "nameAsc" | "nameDesc"
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"

  const [promptText, setPromptText] = useState("");
  const [selectedModel] = useState("VOO Agent 3.5");

  // File collection for current tab
  const [fileList, setFileList] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Active workspace state
  const [workspaceConfig, setWorkspaceConfig] = useState(() => {
    const isElectron = ElectronWorkspaceDriver.isAvailable();
    const path = getSetting("voo.workspace.path");
    const type = getSetting("voo.workspace.type");
    return {
      path: path || (isElectron ? "~/Documents/VOO/Projects" : "Virtual Workspace"),
      type: type || (isElectron ? "electron" : "web-idb"),
      name: getSetting("voo.workspace.name") || "VOO Projects",
    };
  });

  // Context menu & dialog state
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [renameItem, setRenameItem] = useState(null);
  const [renameInput, setRenameInput] = useState("");
  const [confirmEmptyTrashOpen, setConfirmEmptyTrashOpen] = useState(false);

  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const setWelcomeOpen = useDesignStore((state) => state.setWelcomeOpen);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuId(null);
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Fetch files based on current tab, search, category, sort from workspaceStorage
  const reloadFiles = useCallback(async () => {
    let sortField = "updatedAt";
    let sortOrder = "desc";
    if (sortBy === "oldest") {
      sortField = "updatedAt";
      sortOrder = "asc";
    } else if (sortBy === "nameAsc") {
      sortField = "name";
      sortOrder = "asc";
    } else if (sortBy === "nameDesc") {
      sortField = "name";
      sortOrder = "desc";
    }

    const options = {
      search: searchQuery,
      sortBy: sortField,
      sortOrder,
    };

    try {
      let files = [];
      if (activeTab === "recents") {
        const workspaceFiles = await workspaceStorage.scanFiles(options);
        const localRecents = getRecentFiles(options);
        const seen = new Set();
        files = [];
        for (const f of workspaceFiles) {
          const key = f.path || f.id || f.name;
          seen.add(key);
          seen.add(f.name);
          files.push(f);
        }
        for (const r of localRecents) {
          const key = r.path || r.id || r.name;
          if (!seen.has(key) && !seen.has(r.name)) {
            seen.add(key);
            seen.add(r.name);
            files.push(r);
          }
        }
      } else if (activeTab === "starred") {
        const workspaceStarred = await workspaceStorage.scanFiles({ ...options, starredOnly: true });
        const localStarred = getStarredFiles(options);
        const seen = new Set();
        files = [];
        for (const f of workspaceStarred) {
          const key = f.path || f.id || f.name;
          seen.add(key);
          seen.add(f.name);
          files.push(f);
        }
        for (const r of localStarred) {
          const key = r.path || r.id || r.name;
          if (!seen.has(key) && !seen.has(r.name)) {
            seen.add(key);
            seen.add(r.name);
            files.push(r);
          }
        }
      } else if (activeTab === "trash") {
        files = await workspaceStorage.scanFiles({ ...options, trashOnly: true });
      } else if (activeTab === "drafts") {
        const all = await workspaceStorage.scanFiles(options);
        files = all.filter((f) => f.isDraft);
        const localDrafts = getDrafts(options);
        const seenIds = new Set(files.map((d) => d.id || d.name));
        for (const ld of localDrafts) {
          if (!seenIds.has(ld.id) && !seenIds.has(ld.name)) {
            files.push(ld);
          }
        }
      }

      // A project folder shows only the files that live in that subdirectory.
      if (activeFolder) {
        files = (files || []).filter((file) => file.folder === activeFolder);
      } else if (activeTab === "recents" || activeTab === "starred" || activeTab === "drafts") {
        // Root tabs hide files that already belong to a project folder.
        files = (files || []).filter((file) => !file.folder);
      }

      // Sort merged list
      if (files && files.length > 0) {
        files.sort((a, b) => {
          let valA = a[sortField];
          let valB = b[sortField];
          if (sortField === "name") {
            valA = (a.name || "").toLowerCase();
            valB = (b.name || "").toLowerCase();
            return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
          }
          valA = valA || 0;
          valB = valB || 0;
          return sortOrder === "asc" ? valA - valB : valB - valA;
        });
      }

      setFileList(files || []);
    } catch (err) {
      console.warn("[VOO] reloadFiles failed with workspaceStorage, falling back to recent_files:", err);
      if (activeTab === "recents") {
        setFileList(getRecentFiles(options));
      } else if (activeTab === "drafts") {
        setFileList(getDrafts(options));
      } else if (activeTab === "starred") {
        setFileList(getStarredFiles(options));
      } else if (activeTab === "trash") {
        setFileList(getTrashFiles(options));
      }
    }
  }, [activeTab, searchQuery, sortBy, activeFolder]);

  // Initial load and subscriptions to workspace changes
  useEffect(() => {
    let mounted = true;
    const fetchConfig = async () => {
      try {
        const cfg = await workspaceStorage.getConfig();
        if (mounted && cfg) {
          setWorkspaceConfig((prev) => ({
            ...prev,
            path: cfg.path || prev.path,
            type: cfg.type || prev.type,
          }));
        }
      } catch (err) {
        console.warn("[VOO] Failed to fetch workspace config:", err);
      }
    };

    fetchConfig();
    (async () => {
      try {
        await migrateLegacyFolderMembership(workspaceStorage);
      } catch (err) {
        console.warn("[VOO] legacy folder migrate failed:", err);
      }
      if (mounted) reloadFiles();
    })();

    // Subscribe to workspaceStorage events
    const unsubStorage = workspaceStorage.subscribe(() => {
      reloadFiles();
    });

    // Subscribe to window event "voo:workspace-changed"
    const handleWorkspaceChanged = (e) => {
      if (e?.detail) {
        setWorkspaceConfig((prev) => ({
          ...prev,
          ...e.detail,
        }));
      } else {
        fetchConfig();
      }
      reloadFiles();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("voo:workspace-changed", handleWorkspaceChanged);
    }

    return () => {
      mounted = false;
      if (typeof unsubStorage === "function") unsubStorage();
      if (typeof window !== "undefined") {
        window.removeEventListener("voo:workspace-changed", handleWorkspaceChanged);
      }
    };
  }, [reloadFiles]);

  const loadFolders = useCallback(async () => {
    try {
      setFolders(await workspaceStorage.listFolders());
    } catch (err) {
      console.warn("[VOO] listFolders failed:", err);
      setFolders([]);
    }
  }, []);

  useEffect(() => {
    loadFolders();
    window.addEventListener("voo:workspace-changed", loadFolders);
    return () => window.removeEventListener("voo:workspace-changed", loadFolders);
  }, [loadFolders]);

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    const res = await workspaceStorage.createFolder(name);
    if (res.ok) {
      setFolderName("");
      setCreatingFolder(false);
      loadFolders();
      return;
    }
    const messageKeys = { already_exists: "welcome.folders.exists", invalid_name: "welcome.folders.invalid" };
    setFolderError(t(messageKeys[res.error] || "welcome.folders.failed"));
  };

  const handleCreateNew = async (preset = null) => {
    let baseLabel = "Design 1";
    let width = 1200;
    let height = 800;
    let canvasType = CANVAS_TYPE.DESIGN;
    let category = "web";

    if (preset) {
      baseLabel = preset.label ? t(preset.label) : preset.name || "Untitled";
      width = preset.width || 1200;
      height = preset.height || 800;
      canvasType = preset.type || CANVAS_TYPE.DESIGN;
      category = preset.category || guessCategory(baseLabel);
    }

    // Ensure unique file name
    const existingNames = new Set(fileList.map((f) => f.name));
    let uniqueName = `${baseLabel}.voo`;
    let counter = 1;
    while (existingNames.has(uniqueName)) {
      counter += 1;
      uniqueName = `${baseLabel} ${counter}.voo`;
    }

    const pageId = `page-${Date.now().toString(36)}`;
    const doc = createDocument(width, height, "#171717", { canvasType, canvasId: pageId });
    const vooFile = {
      format: "voo",
      version: 2,
      kind: "design",
      document: doc,
      assets: {},
    };
    const bytes = encodeVooBinary(vooFile);

    try {
      const saved = await workspaceStorage.writeFileBytes(uniqueName, bytes, { category });
      addRecentFile({
        name: saved?.name || uniqueName,
        path: saved?.path || null,
        category,
        isDraft: false,
      });
      useDesignStore.getState().loadVooProject({
        vooData: vooFile,
        filePath: saved?.path || null,
        fileName: saved?.name || uniqueName,
        fileHandle: saved?.handle || null,
      });
      await reloadFiles();
      setWelcomeOpen(false);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.writeFileBytes failed, fallback to memory project:", err);
      useDesignStore.getState().newVooProject({ label: baseLabel, width, height, canvasType });
      addRecentFile({
        name: uniqueName,
        path: null,
        isDraft: true,
        category,
      });
      await reloadFiles();
      setWelcomeOpen(false);
    }
  };

  const handleUseTemplate = async (template) => {
    try {
      const doc = template.createDoc();
      const pageId = `page-${Date.now().toString(36)}`;
      doc.id = pageId;

      const vooFile = {
        format: "voo",
        version: 2,
        kind: "design",
        document: doc,
        assets: {},
      };

      const bytes = encodeVooBinary(vooFile);
      const baseName = template.title || "Community Template";
      const existingNames = new Set(fileList.map((f) => f.name));
      let uniqueName = `${baseName}.voo`;
      let counter = 1;
      while (existingNames.has(uniqueName)) {
        counter += 1;
        uniqueName = `${baseName} (${counter}).voo`;
      }

      let saved = null;
      try {
        saved = await workspaceStorage.writeFileBytes(uniqueName, bytes, {
          category: template.category || "web",
        });
      } catch (err) {
        console.warn("[VOO] workspaceStorage.writeFileBytes error, continuing in-memory:", err);
      }

      addRecentFile({
        name: saved?.name || uniqueName,
        path: saved?.path || null,
        category: template.category || "web",
        isDraft: false,
      });

      useDesignStore.getState().loadVooProject({
        vooData: vooFile,
        filePath: saved?.path || null,
        fileName: saved?.name || uniqueName,
        fileHandle: saved?.handle || null,
      });

      await reloadFiles();
      setWelcomeOpen(false);
    } catch (err) {
      console.error("[VOO] Failed to instantiate community template:", err);
    }
  };

  const handlePromptSubmit = async (e) => {
    e?.preventDefault();
    const activePreset = AI_GEN_TYPES.find((p) => p.id === activePill) || AI_GEN_TYPES[0];
    const userPrompt = promptText.trim();
    const docLabel = userPrompt ? userPrompt.slice(0, 24) : t(activePreset.label);

    await handleCreateNew({
      label: docLabel,
      width: activePreset.width,
      height: activePreset.height,
      type: activePreset.type,
      category: activePreset.category,
    });

    if (typeof window !== "undefined") {
      const promptToDispatch =
        userPrompt ||
        `${t(activePreset.label)}: Generate a modern, production-grade ${activePreset.id} interface with clean visual hierarchy.`;
      const context = {
        generationType: activePreset.id,
        preset: activePreset.id,
        targetWidth: activePreset.width,
        targetHeight: activePreset.height,
        fromWelcomeDashboard: true,
      };

      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("voo:open-agent-panel", { detail: { context } })
        );
        window.dispatchEvent(
          new CustomEvent("voo:agent-prompt", {
            detail: {
              prompt: promptToDispatch,
              intent: "generate",
              tool: "canvas_generate",
              context,
              autoSend: true,
            },
          })
        );
      }, 100);
    }
  };

  const handleOpenLocal = async () => {
    try {
      const res = await openVooProject({ store: useDesignStore.getState() });
      if (res?.success) {
        setWelcomeOpen(false);
      }
    } catch (err) {
      console.error("[VOO] Failed to open project:", err);
    }
  };

  const handleOpenRecent = async (item) => {
    try {
      if (item.path) {
        const res = await openVooProject({
          store: useDesignStore.getState(),
          fileOrPath: item.path,
        });
        if (res?.success) {
          setWelcomeOpen(false);
        }
      } else if (item.id) {
        // Read file bytes from workspaceStorage (for Web FSA or Virtual IndexedDB)
        try {
          const bytes = await workspaceStorage.readFileBytes(item.id);
          const file = new File([bytes], item.name, {
            type: "application/octet-stream",
          });
          const res = await openVooProject({
            store: useDesignStore.getState(),
            fileOrPath: file,
          });
          if (res?.success) {
            useDesignStore.getState().setFileName?.(item.name);
            setWelcomeOpen(false);
          }
        } catch {
          handleOpenLocal();
        }
      } else {
        handleOpenLocal();
      }
    } catch (err) {
      console.error("[VOO] Failed to open project:", err);
    }
  };

  const handleToggleStar = async (e, id) => {
    e?.stopPropagation?.();
    try {
      await workspaceStorage.toggleStar(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.toggleStar error:", err);
    }
    toggleStarFile(id);
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleMoveToFolder = async (e, id, folderName) => {
    e?.stopPropagation?.();
    try {
      const res = await workspaceStorage.moveToFolder(id, folderName || null);
      if (!res?.ok) {
        console.warn("[VOO] moveToFolder failed:", res?.error);
      }
    } catch (err) {
      console.warn("[VOO] workspaceStorage.moveToFolder error:", err);
    }
    await reloadFiles();
  };

  const handleStartRename = (e, item) => {
    e.stopPropagation();
    setRenameItem(item);
    setRenameInput((item.name || "").replace(/\.voo$/i, ""));
    setActiveMenuId(null);
  };

  const handleConfirmRename = async () => {
    if (renameItem && renameInput.trim()) {
      const cleanName = renameInput.trim();
      const formattedName = cleanName.endsWith(".voo") ? cleanName : `${cleanName}.voo`;
      try {
        const res = await workspaceStorage.renameFile(renameItem.id, formattedName);
        const currentStore = useDesignStore.getState();
        // If currently open in canvas, update canvas filePath and fileName in designStore
        if (
          renameItem.path &&
          currentStore.filePath &&
          currentStore.filePath === renameItem.path
        ) {
          const newPath =
            res?.file?.path ||
            res?.newPath ||
            (renameItem.path.includes("/")
              ? renameItem.path.replace(/[^/]+$/, formattedName)
              : renameItem.path.replace(/[^\\]+$/, formattedName));
          currentStore.setFilePath?.(newPath);
          currentStore.setFileName?.(formattedName);
        } else if (
          (!renameItem.path || !currentStore.filePath) &&
          currentStore.fileName === renameItem.name
        ) {
          currentStore.setFileName?.(formattedName);
        }
      } catch (err) {
        console.warn("[VOO] workspaceStorage.renameFile error:", err);
      }
      renameRecentFile(renameItem.id, formattedName);
      await reloadFiles();
    }
    setRenameItem(null);
    setRenameInput("");
  };

  const handleDuplicate = (e, id) => {
    e.stopPropagation();
    duplicateRecentFile(id);
    reloadFiles();
    setActiveMenuId(null);
  };

  const handleMoveToTrash = async (e, id) => {
    e?.stopPropagation?.();
    try {
      await workspaceStorage.moveToTrash(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.moveToTrash error:", err);
    }
    moveToTrash(id);
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleRestore = async (e, id) => {
    e?.stopPropagation?.();
    try {
      await workspaceStorage.restoreFromTrash(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.restoreFromTrash error:", err);
    }
    restoreFromTrash(id);
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleDeletePermanently = async (e, id) => {
    e?.stopPropagation?.();
    try {
      await workspaceStorage.deletePermanently(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.deletePermanently error:", err);
    }
    deletePermanently(id);
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleEmptyTrash = async () => {
    try {
      await workspaceStorage.emptyTrash();
    } catch (err) {
      console.warn("[VOO] workspaceStorage.emptyTrash error:", err);
    }
    emptyTrash();
    setConfirmEmptyTrashOpen(false);
    await reloadFiles();
  };

  // Drag & drop .voo project file onto dashboard
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    const vooFile = files.find((f) =>
      /\.(voo|json|psd|fig|pen|svg)$/i.test(f.name ?? ""),
    );
    if (vooFile) {
      const res = await openVooProject({
        store: useDesignStore.getState(),
        fileOrPath: vooFile,
      });
      if (res?.success) {
        setWelcomeOpen(false);
      }
    }
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return t("welcome.time.today");
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return t("welcome.time.justNow");
    if (mins < 60) return t("welcome.time.minutesAgo", { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("welcome.time.hoursAgo", { n: hours });
    const days = Math.floor(hours / 24);
    if (days === 1) return t("welcome.time.yesterday");
    if (days < 30) return t("welcome.time.daysAgo", { n: days });
    return new Date(timestamp).toLocaleDateString();
  };

  const sortLabelMap = {
    updatedAt: t("welcome.sort.lastModified"),
    oldest: t("welcome.sort.oldestModified"),
    nameAsc: t("welcome.sort.nameAsc"),
    nameDesc: t("welcome.sort.nameDesc"),
  };

  const isFileBrowsingTab = ["recents", "drafts", "starred", "trash"].includes(activeTab);

  return (
    <div
      className="welcome-dashboard relative flex h-full w-full select-none bg-black text-neutral-100 overflow-hidden rounded-3xl"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsDragOver(false);
        }
      }}
      onDrop={handleDrop}
    >
      {/* Hidden file input for file selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".voo,.psd,.fig,.pen,.svg,application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            const res = await openVooProject({ store: useDesignStore.getState(), fileOrPath: file });
            if (res?.success) setWelcomeOpen(false);
          }
        }}
      />

      {/* Drag & drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md m-4 rounded-3xl pointer-events-none transition-all">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 mb-3 animate-pulse">
            <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <p className="text-[15px] font-medium text-white">{t("welcome.drop.title")}</p>
          <p className="text-xs text-neutral-400 mt-1">{t("welcome.drop.subtitle")}</p>
        </div>
      )}

      {/* Left Sidebar (Figma-aligned Workspace Hierarchy) */}
      <aside className="flex w-60 shrink-0 flex-col bg-black pt-3 pb-3 px-2 rounded-tl-3xl justify-between">
        <div className="space-y-4">

          {/* Search lives in the sidebar, top-left, not in each page header */}
          <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("welcome.search.placeholder")}
                data-search-field
                className="w-full h-8 pl-8 pr-7 text-xs rounded-xl bg-neutral-900/80 text-neutral-200 placeholder-neutral-400 focus:outline-none focus:bg-neutral-800 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
          </div>

          {/* Core Navigation List */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setActiveFolder(null);
                setActiveTab("recents");
              }}
              className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "recents"
                  ? "bg-neutral-800/90 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{t("welcome.nav.recents")}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("drafts")}
              className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "drafts"
                  ? "bg-neutral-800/90 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <File size={14} className="text-neutral-400" />
              <span>{t("welcome.nav.drafts")}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("starred")}
              className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "starred"
                  ? "bg-neutral-800/90 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <Star size={14} className="text-neutral-400" />
              <span>{t("welcome.nav.starred")}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("trash")}
              className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "trash"
                  ? "bg-neutral-800/90 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <Trash2 size={14} className="text-neutral-400" />
              <span>{t("welcome.nav.trash")}</span>
            </button>
          </div>

          {/* Section: Project folders, created in the workspace (Figma-style sidebar) */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between pt-2 pb-1 pl-2.5 pr-1.5">
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                {t("welcome.folders.title")}
              </span>
              <button
                type="button"
                aria-label={t("welcome.folders.new")}
                title={t("welcome.folders.new")}
                onClick={() => {
                  setFolderError("");
                  setCreatingFolder(true);
                }}
                className="rounded-md p-0.5 text-neutral-400 hover:bg-neutral-800/60 hover:text-white transition-colors cursor-pointer"
              >
                <Plus size={12} />
              </button>
            </div>

            {creatingFolder && (
              <form onSubmit={handleCreateFolder} className="px-1 pb-1">
                <input
                  autoFocus
                  type="text"
                  value={folderName}
                  onChange={(e) => {
                    setFolderName(e.target.value);
                    setFolderError("");
                  }}
                  onBlur={() => {
                    if (!folderName.trim()) setCreatingFolder(false);
                  }}
                  placeholder={t("welcome.folders.placeholder")}
                  aria-label={t("welcome.folders.placeholder")}
                  className="w-full h-7 px-2 text-xs rounded-lg bg-neutral-900/80 text-neutral-200 placeholder-neutral-400 focus:outline-none focus:bg-neutral-800 transition-colors"
                />
                {folderError && <p className="px-1 pt-1 text-[10px] text-rose-400">{folderError}</p>}
              </form>
            )}

            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                data-testid="sidebar-folder"
                onClick={() => {
                  setActiveFolder(folder.name);
                  setActiveTab("recents");
                }}
                className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  activeFolder === folder.name
                    ? "bg-neutral-800/90 text-white"
                    : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
                }`}
              >
                <FolderOpen size={14} className="shrink-0 text-neutral-400" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
          </div>

          {/* Section: Templates & Systems */}
          <div className="space-y-0.5">
            <div className="pt-2 pb-1 px-2.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
              {t("welcome.nav.templates")}
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("design-systems")}
              className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "design-systems"
                  ? "bg-neutral-800/90 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
              <span>{t("welcome.nav.designSystems")}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("shortcuts")}
              className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "shortcuts"
                  ? "bg-neutral-800/90 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>{t("welcome.nav.shortcuts")}</span>
            </button>
          </div>
        </div>

        {/* Sidebar Footer Status */}
        <div className="px-2 pt-4">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
            <span>VOO Design 1.0</span>
            <span className="size-1.5 rounded-full bg-mint" />
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-neutral-950 overflow-y-auto">
        {/* Top Header Strip with Search, View Mode, Sort and Actions */}
        <header className="flex h-14 shrink-0 items-center justify-between px-8 bg-neutral-950/60 backdrop-blur-md sticky top-0 z-20 gap-4">
          {/* Right: Controls & Actions */}
          <div className="ml-auto flex items-center gap-2.5 shrink-0">
            {/* Trash specific action: Empty trash */}
            {activeTab === "trash" && fileList.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmEmptyTrashOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                <span>{t("welcome.actions.emptyTrash")}</span>
              </button>
            )}

            {/* Open File */}
            <button
              type="button"
              onClick={() => handleOpenLocal()}
              className="flex items-center gap-1.5 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
            >
              <FolderOpen size={13} className="text-neutral-400" />
              <span>{t("welcome.header.open")}</span>
            </button>

            {/* New Design File */}
            <button
              type="button"
              onClick={() => handleCreateNew()}
              className="flex items-center gap-1.5 rounded-xl bg-white hover:bg-neutral-100 text-black px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer"
            >
              <Plus size={14} className="text-black" />
              <span>{t("welcome.header.new")}</span>
            </button>
          </div>
        </header>

        {/* =================== TAB 1: RECENTS =================== */}
        {activeTab === "recents" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-8">
            {/* AI Generation Preset Types Row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
                <Sparkles size={14} className="text-amber-400" />
                <span>{t("welcome.prompt.aiGenTypes")}</span>
              </div>

              <div
                className="flex items-center gap-1.5 flex-wrap justify-center"
                role="radiogroup"
                aria-label={t("welcome.prompt.aiGenTypes")}
              >
                {AI_GEN_TYPES.map((typeItem) => {
                  const Icon = typeItem.icon;
                  const isSelected = activePill === typeItem.id;
                  return (
                    <button
                      key={typeItem.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setActivePill(typeItem.id)}
                      className={`group flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                        isSelected
                          ? "bg-neutral-800 text-white shadow-pop ring-1 ring-white/10"
                          : "bg-neutral-900/70 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
                      }`}
                    >
                      {Icon && (
                        <Icon
                          size={13}
                          className={`transition-colors ${
                            isSelected
                              ? "text-mint"
                              : "text-neutral-500 group-hover:text-neutral-300"
                          }`}
                        />
                      )}
                      <span>{t(typeItem.label)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Central Prompt Box */}
            <form onSubmit={handlePromptSubmit} className="prompt-composer relative rounded-3xl p-4 transition-all">
              <div className="absolute -top-px left-1/4 right-1/4 h-px bg-white/10 pointer-events-none" />

              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handlePromptSubmit();
                  }
                }}
                placeholder={
                  (() => {
                    const activePreset = AI_GEN_TYPES.find((p) => p.id === activePill) || AI_GEN_TYPES[0];
                    return activePreset?.placeholder
                      ? t(activePreset.placeholder)
                      : t("welcome.prompt.placeholder");
                  })()
                }
                rows={3}
                className="w-full resize-none bg-transparent text-xs text-neutral-100 placeholder-neutral-400 focus:outline-none"
              />

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex size-7 items-center justify-center rounded-xl bg-neutral-800/60 hover:bg-neutral-700/80 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title={t("welcome.actions.addAssetsTitle")}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400/90 font-mono">
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <span>1x</span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-neutral-400 bg-neutral-800/70 px-2.5 py-1 rounded-lg">
                    <span>{selectedModel}</span>
                  </div>

                  <button
                    type="submit"
                    className="flex size-7 items-center justify-center rounded-full bg-neutral-700 hover:bg-mint hover:text-black text-neutral-200 transition-colors cursor-pointer"
                    title={t("welcome.actions.createNowTitle")}
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>

            {/* Quick Action Cards (Import Figma / Browser / Recreate) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2.5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-700/70 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="size-4 text-neutral-400 group-hover:text-neutral-200 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z" />
                  <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z" />
                  <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z" />
                  <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z" />
                  <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z" />
                </svg>
                <span>{t("welcome.actions.importFigma")}</span>
              </button>

              <button
                type="button"
                onClick={() => handleCreateNew(AI_GEN_TYPES[0])}
                className="flex items-center justify-center gap-2.5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-700/70 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="size-4 text-neutral-400 group-hover:text-neutral-200 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span>{t("welcome.actions.importBrowser")}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2.5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-700/70 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="size-4 text-neutral-400 group-hover:text-neutral-200 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>{t("welcome.actions.recreateScreenshot")}</span>
              </button>
            </div>

            {/* Recents Section Header & File List */}
            <div className="space-y-4 pt-2">
              {renderFileCollection(fileList, viewMode)}
            </div>
          </div>
        )}

        {/* =================== TAB 2: DRAFTS =================== */}
        {activeTab === "drafts" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-6">
            {renderFileCollection(fileList, viewMode, "drafts")}
          </div>
        )}

        {/* =================== TAB 3: STARRED =================== */}
        {activeTab === "starred" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-6">
            {renderFileCollection(fileList, viewMode, "starred")}
          </div>
        )}

        {/* =================== TAB 4: TRASH =================== */}
        {activeTab === "trash" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-6">
            {renderFileCollection(fileList, viewMode, "trash")}
          </div>
        )}

        {/* =================== TAB 5: COMMUNITY TEMPLATES & DESIGN SYSTEMS =================== */}
        {activeTab === "design-systems" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-6">
            <CommunityTemplatesView onUseTemplate={handleUseTemplate} />
          </div>
        )}

        {/* =================== TAB 6: SHORTCUTS & USER GUIDE =================== */}
        {activeTab === "shortcuts" && (
          <div className="flex-1 p-8 max-w-4xl w-full mx-auto space-y-6">
            <div className="rounded-3xl bg-neutral-900/30 p-6 space-y-4">
              <h2 className="text-xs font-semibold text-white flex items-center gap-2">
                <span>{t("welcome.shortcuts.title")}</span>
                <span className="text-xs font-normal text-neutral-500 font-mono">
                  {t("welcome.shortcuts.habit")}
                </span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {SHORTCUTS_LIST.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/60 text-xs">
                    <span className="text-neutral-400">{t(item.desc)}</span>
                    <span className="font-mono text-neutral-200 bg-neutral-800 px-2 py-0.5 rounded-lg">
                      {t(item.key)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-neutral-900/20 p-6 space-y-2 text-xs text-neutral-400">
              <h3 className="font-semibold text-neutral-200">{t("welcome.voo.title")}</h3>
              <p>
                {t("welcome.voo.body.before")}{" "}
                <code className="text-mint font-mono">.voo</code>{" "}
                {t("welcome.voo.body.after")}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* =================== RENAME MODAL DIALOG =================== */}
      {renameItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-neutral-900 border border-white/10 shadow-panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white">{t("welcome.dialog.renameTitle")}</h3>
              <button
                type="button"
                onClick={() => setRenameItem(null)}
                className="rounded-xl p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmRename();
                if (e.key === "Escape") setRenameItem(null);
              }}
              autoFocus
              className="w-full rounded-xl bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-400 focus:outline-none"
              placeholder={t("welcome.dialog.renamePlaceholder")}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenameItem(null)}
                className="rounded-xl px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white cursor-pointer"
              >
                {t("welcome.dialog.cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmRename}
                className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200 cursor-pointer"
              >
                {t("welcome.dialog.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================== EMPTY TRASH CONFIRMATION MODAL =================== */}
      {confirmEmptyTrashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-neutral-900 border border-white/10 shadow-panel p-5 space-y-4">
            <h3 className="text-xs font-semibold text-white">{t("welcome.actions.emptyTrash")}</h3>
            <p className="text-xs text-neutral-400">{t("welcome.dialog.emptyTrashConfirm")}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmEmptyTrashOpen(false)}
                className="rounded-xl px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white cursor-pointer"
              >
                {t("welcome.dialog.cancel")}
              </button>
              <button
                type="button"
                onClick={handleEmptyTrash}
                className="rounded-xl bg-neutral-800 px-3.5 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 cursor-pointer"
              >
                {t("welcome.dialog.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* Helper to render either Grid or List view, or empty states */
  /** Title, count, sort and view controls shown above every file list. */
  function renderFileListToolbar() {
    const title =
      activeTab === "recents" ? t("welcome.nav.recents")
      : activeTab === "drafts" ? t("welcome.nav.drafts")
      : activeTab === "starred" ? t("welcome.nav.starred")
      : t("welcome.nav.trash");
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-neutral-200">{title}</h2>
          <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded-md">
            {fileList.length}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
              <>
                {/* Sort Dropdown */}
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setSortMenuOpen(!sortMenuOpen)}
                    className="flex items-center gap-1.5 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors cursor-pointer"
                  >
                    <span>{sortLabelMap[sortBy] || t("welcome.sort.lastModified")}</span>
                    <ChevronDown size={12} className="text-neutral-400" />
                  </button>

                  {sortMenuOpen && (
                    <div className="absolute right-0 mt-1 w-36 rounded-2xl bg-neutral-900 border border-white/10 shadow-menu py-1 z-30">
                      {["updatedAt", "oldest", "nameAsc", "nameDesc"].map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setSortBy(key);
                            setSortMenuOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                            sortBy === key ? "text-mint font-medium bg-neutral-800/60" : "text-neutral-300 hover:bg-neutral-800"
                          }`}
                        >
                          {sortLabelMap[key]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* View Switcher: Grid vs List */}
                <div className="flex items-center rounded-xl bg-neutral-900/80 p-0.5 text-neutral-400">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`p-1 rounded-lg cursor-pointer transition-colors ${
                      viewMode === "grid" ? "text-white bg-neutral-800" : "hover:text-neutral-200"
                    }`}
                    title={t("welcome.view.grid")}
                  >
                    <LayoutGrid size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`p-1 rounded-lg cursor-pointer transition-colors ${
                      viewMode === "list" ? "text-white bg-neutral-800" : "hover:text-neutral-200"
                    }`}
                    title={t("welcome.view.list")}
                  >
                    <List size={13} />
                  </button>
                </div>
              </>
        </div>
      </div>
    );
  }

  function renderFileCollection(items, mode, tabType = "recents") {
    return (
      <div className="space-y-4">
        {renderFileListToolbar()}
        {renderFileItems(items, mode, tabType)}
      </div>
    );
  }

  function renderFileItems(items, mode, tabType = "recents") {
    if (items.length === 0) {
      if (searchQuery) {
        return (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-3xl bg-neutral-900/20">
            <Search size={28} className="text-neutral-500 mb-2" />
            <p className="text-xs font-medium text-neutral-300">{t("welcome.empty.search")}</p>
            <p className="text-[11px] text-neutral-500 mt-1">"{searchQuery}"</p>
          </div>
        );
      }

      if (tabType === "starred") {
        return (
          <div className="flex flex-col items-center justify-center p-16 text-center rounded-3xl bg-neutral-900/20">
            <Star size={28} className="text-neutral-400 mb-3" />
            <p className="text-xs font-medium text-neutral-200">{t("welcome.empty.starred")}</p>
            <p className="text-[11px] text-neutral-500 mt-1 max-w-sm">{t("welcome.empty.starredDesc")}</p>
          </div>
        );
      }

      if (tabType === "trash") {
        return (
          <div className="flex flex-col items-center justify-center p-16 text-center rounded-3xl bg-neutral-900/20">
            <Trash2 size={28} className="text-neutral-500 mb-3" />
            <p className="text-xs font-medium text-neutral-200">{t("welcome.empty.trash")}</p>
            <p className="text-[11px] text-neutral-500 mt-1 max-w-sm">{t("welcome.empty.trashDesc")}</p>
          </div>
        );
      }

      if (tabType === "drafts") {
        return (
          <div className="flex flex-col items-center justify-center p-16 text-center rounded-3xl bg-neutral-900/20">
            <File size={28} className="text-neutral-500 mb-3" />
            <p className="text-xs font-medium text-neutral-200">{t("welcome.empty.drafts")}</p>
            <p className="text-[11px] text-neutral-500 mt-1 max-w-sm">{t("welcome.empty.draftsDesc")}</p>
          </div>
        );
      }

      return null;
    }

    // Grid View
    if (mode === "grid") {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((item) => {
            const isMenuOpen = activeMenuId === item.id;
            const isTrash = activeTab === "trash";

            return (
              <div
                key={item.id}
                onClick={() => (isTrash ? handleRestore(null, item.id) : handleOpenRecent(item))}
                className="group relative flex flex-col rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/90 transition-all cursor-pointer"
              >
                {/* Thumbnail Preview Area */}
                <div className="relative aspect-[16/10] bg-neutral-900 rounded-t-2xl flex items-center justify-center p-3">
                  {item.preview ? (
                    <img src={item.preview} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <div className="absolute inset-0 rounded-t-2xl bg-neutral-700" />
                  )}

                  {/* Top action overlay: Star & More menu button */}
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {/* Star button */}
                    {!isTrash && (
                      <button
                        type="button"
                        onClick={(e) => handleToggleStar(e, item.id)}
                        className={`flex size-6 items-center justify-center rounded-xl backdrop-blur-md transition-colors ${
                          item.starred
                            ? "bg-black/80 text-neutral-100 !opacity-100"
                            : "bg-black/60 text-neutral-400 hover:text-neutral-100"
                        }`}
                        title={item.starred ? t("welcome.actions.unstar") : t("welcome.actions.star")}
                      >
                        <Star size={12} className={item.starred ? "fill-neutral-100" : ""} />
                      </button>
                    )}

                    {/* Right-aligned more menu button */}
                    <div className="ml-auto relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : item.id);
                        }}
                        className="flex size-6 items-center justify-center rounded-xl bg-black/60 text-neutral-300 hover:text-white backdrop-blur-md transition-colors"
                        title={t("welcome.actions.more")}
                      >
                        <MoreHorizontal size={13} />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-7 w-36 rounded-2xl bg-neutral-900 border border-white/10 shadow-menu py-1 z-30"
                        >
                          {isTrash ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => handleRestore(e, item.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <RotateCcw size={12} className="text-neutral-400" />
                                <span>{t("welcome.actions.restore")}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeletePermanently(e, item.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <Trash2 size={12} />
                                <span>{t("welcome.actions.deletePermanently")}</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenRecent(item)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <FolderOpen size={12} className="text-neutral-400" />
                                <span>{t("welcome.actions.openFile")}</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleOpenLocal}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <FolderOpen size={12} className="text-neutral-400" />
                                <span>{t("welcome.actions.openLocal")}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleToggleStar(e, item.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <Star size={12} className={item.starred ? "text-neutral-100 fill-neutral-100" : "text-neutral-400"} />
                                <span>{item.starred ? t("welcome.actions.unstar") : t("welcome.actions.star")}</span>
                              </button>
                              {folders
                                .filter((folder) => folder.name !== item.folder)
                                .map((folder) => (
                                <button
                                  key={folder.id}
                                  type="button"
                                  onClick={(e) => handleMoveToFolder(e, item.id, folder.name)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                                >
                                  <FolderOpen size={12} className="text-neutral-400" />
                                  <span>{`${t("welcome.folders.moveTo")} ${folder.name}`}</span>
                                </button>
                              ))}
                              {item.folder ? (
                                <button
                                  type="button"
                                  onClick={(e) => handleMoveToFolder(e, item.id, null)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                                >
                                  <FolderOpen size={12} className="text-neutral-400" />
                                  <span>{t("welcome.folders.moveToRoot")}</span>
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={(e) => handleStartRename(e, item)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <Pencil size={12} className="text-neutral-400" />
                                <span>{t("welcome.actions.rename")}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDuplicate(e, item.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <Copy size={12} className="text-neutral-400" />
                                <span>{t("welcome.actions.duplicate")}</span>
                              </button>
                              <div className="h-px bg-white/10 my-1" />
                              <button
                                type="button"
                                onClick={(e) => handleMoveToTrash(e, item.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <Trash2 size={12} />
                                <span>{t("welcome.actions.moveToTrash")}</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Meta */}
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-200 group-hover:text-white truncate">
                      <File size={12} className="shrink-0 text-neutral-500" />
                      <span className="truncate">{item.name || "Untitled.voo"}</span>
                    </div>
                    {item.starred && !isTrash && (
                      <Star size={10} className="shrink-0 text-neutral-100 fill-neutral-100" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                    <span>{t("welcome.edited")}{formatRelativeTime(item.updatedAt)}</span>
                    {item.isDraft && (
                      <span className="text-[10px] text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded-md">
                        Draft
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // List View (Tabular Figma layout)
    return (
      <div className="w-full rounded-3xl bg-neutral-900/30 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[11px] font-medium text-neutral-500 bg-neutral-950/40">
          <div className="col-span-6 flex items-center gap-2">
            <span>{t("welcome.table.name")}</span>
          </div>
          <div className="col-span-3">
            <span>{t("welcome.table.lastModified")}</span>
          </div>
          <div className="col-span-2">
            <span>{t("welcome.table.type")}</span>
          </div>
          <div className="col-span-1 text-right">
            <span>{t("welcome.table.actions")}</span>
          </div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-white/5">
          {items.map((item) => {
            const isMenuOpen = activeMenuId === item.id;
            const isTrash = activeTab === "trash";

            return (
              <div
                key={item.id}
                onClick={() => (isTrash ? handleRestore(null, item.id) : handleOpenRecent(item))}
                className="group grid grid-cols-12 gap-3 px-4 py-2.5 items-center hover:bg-neutral-900/60 transition-colors cursor-pointer text-xs"
              >
                {/* Column 1: Star, Icon & Name */}
                <div className="col-span-6 flex items-center gap-2.5 min-w-0">
                  {!isTrash ? (
                    <button
                      type="button"
                      onClick={(e) => handleToggleStar(e, item.id)}
                      className={`p-1 rounded-xl transition-colors ${
                        item.starred ? "text-neutral-100" : "text-neutral-500 hover:text-neutral-400"
                      }`}
                    >
                      <Star size={13} className={item.starred ? "fill-neutral-100" : ""} />
                    </button>
                  ) : (
                    <Trash2 size={13} className="text-neutral-500" />
                  )}

                  <File size={13} className="shrink-0 text-neutral-400" />

                  <span className="truncate font-medium text-neutral-200 group-hover:text-white">
                    {item.name || "Untitled.voo"}
                  </span>

                  {item.isDraft && (
                    <span className="text-[10px] text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded-md font-mono">
                      Draft
                    </span>
                  )}
                </div>

                {/* Column 2: Last Modified */}
                <div className="col-span-3 text-[11px] text-neutral-400 font-mono">
                  {formatRelativeTime(item.updatedAt)}
                </div>

                {/* Column 3: Format / Size */}
                <div className="col-span-2 text-[11px] text-neutral-500 font-mono">
                  {item.category || "Design"} · {item.path ? ".voo" : "Local"}
                </div>

                {/* Column 4: Quick Actions */}
                <div className="col-span-1 flex items-center justify-end relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(isMenuOpen ? null : item.id);
                    }}
                    className="p-1 rounded-xl text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-7 w-36 rounded-2xl bg-neutral-900 border border-white/10 shadow-menu py-1 z-30"
                    >
                      {isTrash ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleRestore(e, item.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                          >
                            <RotateCcw size={12} className="text-neutral-400" />
                            <span>{t("welcome.actions.restore")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeletePermanently(e, item.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            <span>{t("welcome.actions.deletePermanently")}</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenRecent(item)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                          >
                            <FolderOpen size={12} className="text-neutral-400" />
                            <span>{t("welcome.actions.openFile")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenLocal}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                          >
                            <FolderOpen size={12} className="text-neutral-400" />
                            <span>{t("welcome.actions.openLocal")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleToggleStar(e, item.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                          >
                            <Star size={12} className={item.starred ? "text-neutral-100 fill-neutral-100" : "text-neutral-400"} />
                            <span>{item.starred ? t("welcome.actions.unstar") : t("welcome.actions.star")}</span>
                          </button>
                            {folders
                              .filter((folder) => folder.name !== item.folder)
                              .map((folder) => (
                              <button
                                key={folder.id}
                                type="button"
                                onClick={(e) => handleMoveToFolder(e, item.id, folder.name)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <FolderOpen size={12} className="text-neutral-400" />
                                <span>{`${t("welcome.folders.moveTo")} ${folder.name}`}</span>
                              </button>
                            ))}
                            {item.folder ? (
                              <button
                                type="button"
                                onClick={(e) => handleMoveToFolder(e, item.id, null)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                              >
                                <FolderOpen size={12} className="text-neutral-400" />
                                <span>{t("welcome.folders.moveToRoot")}</span>
                              </button>
                            ) : null}
                          <button
                            type="button"
                            onClick={(e) => handleStartRename(e, item)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                          >
                            <Pencil size={12} className="text-neutral-400" />
                            <span>{t("welcome.actions.rename")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDuplicate(e, item.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                          >
                            <Copy size={12} className="text-neutral-400" />
                            <span>{t("welcome.actions.duplicate")}</span>
                          </button>
                          <div className="h-px bg-white/10 my-1" />
                          <button
                            type="button"
                            onClick={(e) => handleMoveToTrash(e, item.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            <span>{t("welcome.actions.moveToTrash")}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
