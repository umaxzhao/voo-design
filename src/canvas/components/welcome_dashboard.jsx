import React, { useState, useEffect, useMemo, useRef } from "react";
import { useDesignStore } from "../../store/design_store.js";
import { openVooProject } from "../store/project_io.js";
import { getRecentFiles, removeRecentFile } from "../store/recent_files.js";
import { CANVAS_TYPE } from "../editor/scene_doc_factory.js";
import { VooBrandLogo } from "../../app_title_bar.jsx";

// Pen app category presets mapped to VOO templates
const CATEGORY_PILLS = [
  { id: "landing", label: "Landing page", width: 1440, height: 900, type: CANVAS_TYPE.DESIGN },
  { id: "mobile", label: "Mobile app", width: 393, height: 852, type: CANVAS_TYPE.DESIGN },
  { id: "web", label: "Web app", width: 1440, height: 900, type: CANVAS_TYPE.DESIGN },
  { id: "slides", label: "Slides", width: 1920, height: 1080, type: CANVAS_TYPE.DESIGN },
  { id: "dashboard", label: "Dashboard", width: 1440, height: 960, type: CANVAS_TYPE.DESIGN },
  { id: "other", label: "Something else...", width: 1200, height: 800, type: CANVAS_TYPE.DESIGN },
];

const SHORTCUTS_LIST = [
  { key: "⌘S / Ctrl+S", desc: "保存当前工程文件 (.voo)" },
  { key: "⌘⇧S / Ctrl+Shift+S", desc: "另存为新 .voo 文件" },
  { key: "⌘O / Ctrl+O", desc: "打开本地 .voo 工程文件" },
  { key: "⌘N / Ctrl+N", desc: "新建设计文件" },
  { key: "V", desc: "选择工具 / 移动图层" },
  { key: "P", desc: "钢笔路径工具 (贝塞尔曲线)" },
  { key: "T", desc: "富文本输入与排版" },
  { key: "R / O", desc: "矩形工具 / 椭圆工具" },
  { key: "Space + 拖动", desc: "画布平移漫游" },
  { key: "⌘ + 滚轮", desc: "缩放画布" },
  { key: "⌘Z / ⌘⇧Z", desc: "撤销 / 重做" },
  { key: "⌘G / ⌘⇧G", desc: "编组 / 解除编组" },
];

export default function WelcomeDashboard() {
  const [activeTab, setActiveTab] = useState("recents"); // "recents" | "drafts" | "design-systems" | "shortcuts"
  const [activePill, setActivePill] = useState("web");
  const [promptText, setPromptText] = useState("");
  const [selectedModel, setSelectedModel] = useState("VOO Agent 3.5");
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [recentList, setRecentList] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const setWelcomeOpen = useDesignStore((state) => state.setWelcomeOpen);
  const nodes = useDesignStore((state) => state.nodes);
  const hasExistingCanvas = Boolean(nodes && nodes.length > 0);

  useEffect(() => {
    setRecentList(getRecentFiles());
  }, []);

  const handleCreateNew = (preset = null) => {
    const newProject = useDesignStore.getState().newVooProject;
    if (preset) {
      newProject?.({
        label: preset.label || "Untitled",
        width: preset.width || 1200,
        height: preset.height || 800,
        canvasType: preset.type || CANVAS_TYPE.DESIGN,
      });
    } else {
      newProject?.({ label: "Design 1" });
    }
  };

  const handlePromptSubmit = (e) => {
    e?.preventDefault();
    const activePreset = CATEGORY_PILLS.find((p) => p.id === activePill) || CATEGORY_PILLS[2];
    handleCreateNew({
      label: promptText.trim() ? promptText.trim().slice(0, 24) : activePreset.label,
      width: activePreset.width,
      height: activePreset.height,
      type: activePreset.type,
    });
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
      } else {
        handleOpenLocal();
      }
    } catch (err) {
      console.error("[VOO] Failed to open recent project:", err);
    }
  };

  const handleRemoveRecent = (e, id) => {
    e.stopPropagation();
    const updated = removeRecentFile(id);
    setRecentList(updated);
  };

  // Drag & drop .voo project file onto dashboard
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    const vooFile = files.find((f) => f.name?.toLowerCase().endsWith(".voo") || f.name?.toLowerCase().endsWith(".json"));
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
    if (!timestamp) return "今天";
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "昨天";
    if (days < 30) return `${days} 天前`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div
      className="welcome-dashboard relative flex h-full w-full select-none bg-[#0d0d0d] text-neutral-100 overflow-hidden font-sans"
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
        accept=".voo,application/json"
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
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md border-2 border-dashed border-[#a7ffd4] m-4 rounded-2xl pointer-events-none transition-all">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[#a7ffd4]/10 text-[#a7ffd4] mb-3 animate-pulse">
            <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <p className="text-[15px] font-medium text-white">松开以打开 .voo 工程文件</p>
          <p className="text-xs text-neutral-400 mt-1">自包含工程，自动恢复全部画板与矢量图层</p>
        </div>
      )}

      {/* Left Sidebar (Pen App style clean navigation) */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-[#111111]/90 backdrop-blur-xl">
        {/* Top Branding (pen.dev style) */}
        <div className="flex h-12 shrink-0 items-center gap-2.5 px-4 pt-1">
          <VooBrandLogo className="size-4 text-[#a7ffd4]" />
          <span className="text-xs font-semibold tracking-wide text-neutral-200">voo.design</span>
        </div>

        {/* Navigation list */}
        <div className="flex-1 px-2.5 py-2 space-y-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("recents")}
            className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "recents"
                ? "bg-neutral-800/90 text-white shadow-pop"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Recents</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("drafts")}
            className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "drafts"
                ? "bg-neutral-800/90 text-white shadow-pop"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>Drafts</span>
          </button>

          <div className="pt-4 pb-1 px-2.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
            Templates
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("design-systems")}
            className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "design-systems"
                ? "bg-neutral-800/90 text-white shadow-pop"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Design Systems</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("shortcuts")}
            className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "shortcuts"
                ? "bg-neutral-800/90 text-white shadow-pop"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>Shortcuts & Guide</span>
          </button>
        </div>

        {/* Bottom Back to Canvas button */}
        {hasExistingCanvas && (
          <div className="p-2.5 border-t border-white/10">
            <button
              type="button"
              onClick={() => setWelcomeOpen(false)}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-200 hover:text-white border border-white/10 transition-colors cursor-pointer"
            >
              <span>返回当前画布</span>
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        )}
      </aside>

      {/* Main Workspace (Pen APP layout) */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0c0c0c] overflow-y-auto">
        {/* Top Header Strip */}
        <header className="flex h-12 shrink-0 items-center justify-between px-8 border-b border-white/10 bg-[#0e0e0e]/40 backdrop-blur-md">
          <h1 className="text-xs font-semibold tracking-wide text-neutral-200">
            {activeTab === "recents" && "Dashboard"}
            {activeTab === "drafts" && "Drafts"}
            {activeTab === "design-systems" && "Design Systems & Templates"}
            {activeTab === "shortcuts" && "Shortcuts & Guide"}
          </h1>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleOpenLocal}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-neutral-900/80 hover:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors cursor-pointer shadow-pop"
            >
              <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span>Open File</span>
            </button>

            <button
              type="button"
              onClick={() => handleCreateNew()}
              className="flex items-center gap-1.5 rounded-lg bg-white hover:bg-neutral-100 text-black px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer shadow-pop"
            >
              <svg className="size-3.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New File</span>
            </button>
          </div>
        </header>

        {/* Tab 1: Dashboard / Recents (Exact Pen.app Hero & Quick Actions & Recents) */}
        {activeTab === "recents" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-8">
            {/* 1. Category Pills Row (Centered) */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {CATEGORY_PILLS.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setActivePill(pill.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                    activePill === pill.id
                      ? "bg-neutral-800 text-white border border-white/10 shadow-pop"
                      : "bg-neutral-900/70 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200 border border-white/10"
                  }`}
                >
                  {pill.id === "landing" && (
                    <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                  )}
                  {pill.id === "mobile" && (
                    <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="6" y="2" width="12" height="20" rx="3" />
                    </svg>
                  )}
                  {pill.id === "web" && (
                    <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <circle cx="6" cy="6" r="0.8" fill="currentColor" />
                      <circle cx="8" cy="6" r="0.8" fill="currentColor" />
                    </svg>
                  )}
                  {pill.id === "slides" && (
                    <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  )}
                  {pill.id === "dashboard" && (
                    <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="7" height="9" rx="1" />
                      <rect x="14" y="3" width="7" height="5" rx="1" />
                      <rect x="14" y="12" width="7" height="9" rx="1" />
                      <rect x="3" y="16" width="7" height="5" rx="1" />
                    </svg>
                  )}
                  {pill.id === "other" && (
                    <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    </svg>
                  )}
                  <span>{pill.label}</span>
                </button>
              ))}
            </div>

            {/* 2. Central Prompt Box (Pen app style with subtle top edge glow) */}
            <form onSubmit={handlePromptSubmit} className="relative rounded-2xl border border-white/10 bg-[#141414]/90 p-4 shadow-panel focus-within:border-white/10 transition-all">
              {/* Top hairline */}
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
                placeholder="Design anything..."
                rows={3}
                className="w-full resize-none bg-transparent text-xs text-neutral-100 placeholder-neutral-400 focus:outline-none"
              />

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex size-7 items-center justify-center rounded-lg bg-neutral-800/60 hover:bg-neutral-700/80 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title="添加素材或打开文件"
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400/90 font-mono">
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <span>1x</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                    </svg>
                    <span>1x</span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-neutral-400 bg-neutral-800/70 px-2 py-1 rounded-md border border-white/10">
                    <span>{selectedModel}</span>
                  </div>

                  <button
                    type="submit"
                    className="flex size-7 items-center justify-center rounded-full bg-neutral-700 hover:bg-[#a7ffd4] hover:text-black text-neutral-200 transition-colors cursor-pointer"
                    title="立即创建设计"
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>

            {/* 3. Three Quick Action Cards (Import Figma / Browser / Recreate) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleCreateNew(CATEGORY_PILLS[2])}
                className="flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-neutral-900/30 hover:bg-neutral-800/40 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="size-4 text-neutral-400 group-hover:text-[#a7ffd4] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z" />
                  <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z" />
                  <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z" />
                  <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z" />
                  <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z" />
                </svg>
                <span>Import from Figma</span>
              </button>

              <button
                type="button"
                onClick={() => handleCreateNew(CATEGORY_PILLS[0])}
                className="flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-neutral-900/30 hover:bg-neutral-800/40 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="size-4 text-neutral-400 group-hover:text-[#a7ffd4] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span>Import from browser</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-neutral-900/30 hover:bg-neutral-800/40 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="size-4 text-neutral-400 group-hover:text-[#a7ffd4] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Recreate a screenshot</span>
              </button>
            </div>

            {/* 4. RECENTS Section (Pen App card grid layout) */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  RECENTS
                </h2>

                <div className="flex items-center gap-1 text-neutral-500">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`p-1 rounded-lg cursor-pointer ${viewMode === "grid" ? "text-white bg-neutral-800" : "hover:text-neutral-300"}`}
                    title="网格视图"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`p-1 rounded-lg cursor-pointer ${viewMode === "list" ? "text-white bg-neutral-800" : "hover:text-neutral-300"}`}
                    title="列表视图"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {recentList.length > 0 ? (
                  recentList.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleOpenRecent(item)}
                      className="group flex flex-col rounded-xl border border-white/10 bg-neutral-900/40 hover:bg-neutral-900/90 hover:border-white/10 transition-all cursor-pointer overflow-hidden shadow-pop"
                    >
                      {/* Thumbnail frame (clean wireframe or preview) */}
                      <div className="relative aspect-[16/10] bg-[#161616] flex items-center justify-center p-3 border-b border-white/10 overflow-hidden">
                        {item.preview ? (
                          <img src={item.preview} alt="" className="h-full w-full object-contain" />
                        ) : (
                          /* Wireframe placeholder representation matching Pen app */
                          <div className="w-full h-full rounded-lg border border-white/10 bg-neutral-800/20 p-2 flex flex-col gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <div className="h-1.5 w-1/3 bg-neutral-600/60 rounded-lg" />
                            <div className="flex-1 grid grid-cols-3 gap-1">
                              <div className="rounded-lg bg-neutral-700/30" />
                              <div className="rounded-lg bg-neutral-700/30" />
                              <div className="rounded-lg bg-neutral-700/20" />
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleRemoveRecent(e, item.id)}
                          className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-md bg-black/60 text-neutral-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="从最近列表移除"
                        >
                          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>

                      {/* Card meta */}
                      <div className="p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-200 group-hover:text-white truncate">
                          <svg className="size-3 shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          </svg>
                          <span className="truncate">{item.name || "Untitled.voo"}</span>
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          Edited {formatRelativeTime(item.updatedAt)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  /* Empty state starter cards */
                  <>
                    <div
                      onClick={() => handleCreateNew(CATEGORY_PILLS[2])}
                      className="group flex flex-col rounded-xl border border-white/10 bg-neutral-900/40 hover:bg-neutral-900/90 hover:border-white/10 transition-all cursor-pointer overflow-hidden shadow-pop"
                    >
                      <div className="relative aspect-[16/10] bg-[#161616] flex items-center justify-center p-3 border-b border-white/10">
                        <div className="w-full h-full rounded-lg border border-white/10 bg-neutral-800/20 p-2 flex flex-col gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <div className="h-1.5 w-1/3 bg-neutral-600/60 rounded-lg" />
                          <div className="flex-1 grid grid-cols-3 gap-1">
                            <div className="rounded-lg bg-neutral-700/30" />
                            <div className="rounded-lg bg-neutral-700/30" />
                            <div className="rounded-lg bg-neutral-700/20" />
                          </div>
                        </div>
                      </div>
                      <div className="p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-200 truncate">
                          <svg className="size-3 shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          </svg>
                          <span>Web App / SaaS Starter</span>
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          1440 × 900 · 基础框架
                        </div>
                      </div>
                    </div>

                    <div
                      onClick={() => handleCreateNew(CATEGORY_PILLS[1])}
                      className="group flex flex-col rounded-xl border border-white/10 bg-neutral-900/40 hover:bg-neutral-900/90 hover:border-white/10 transition-all cursor-pointer overflow-hidden shadow-pop"
                    >
                      <div className="relative aspect-[16/10] bg-[#161616] flex items-center justify-center p-3 border-b border-white/10">
                        <div className="w-16 h-full rounded-lg border border-white/10 bg-neutral-800/20 p-1.5 flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <div className="h-1 w-2/3 bg-neutral-600/60 rounded-lg" />
                          <div className="flex-1 rounded-lg bg-neutral-700/30" />
                        </div>
                      </div>
                      <div className="p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-200 truncate">
                          <svg className="size-3 shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          </svg>
                          <span>iPhone 16 Pro Prototype</span>
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          393 × 852 · 移动端组件
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Drafts */}
        {activeTab === "drafts" && (
          <div className="flex-1 p-8 max-w-4xl w-full mx-auto space-y-4">
            <h2 className="text-xs font-semibold text-white">本地草稿与临时画布</h2>
            <p className="text-xs text-neutral-400">
              VOO Design 采用 Photoshop 式本地工程保存机制：新建文件未按 <code className="text-[#a7ffd4] font-mono">⌘S / Ctrl+S</code> 保存至磁盘前，草稿将留存在当前运行会话中。
            </p>
            <div className="pt-4">
              <button
                type="button"
                onClick={() => handleCreateNew()}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-white transition-colors"
              >
                新建空白草稿画布
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Design Systems & Templates */}
        {activeTab === "design-systems" && (
          <div className="flex-1 p-8 max-w-5xl w-full mx-auto space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {CATEGORY_PILLS.map((pill) => (
                <div
                  key={pill.id}
                  onClick={() => handleCreateNew(pill)}
                  className="group rounded-xl border border-white/10 bg-neutral-900/40 hover:bg-neutral-800/60 p-5 space-y-3 cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white group-hover:text-[#a7ffd4] transition-colors">{pill.label}</span>
                    <span className="text-[10px] font-mono text-neutral-400 px-2 py-0.5 rounded-lg bg-neutral-800">
                      {pill.width} × {pill.height}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400">标准标准尺寸画布，包含自适应布局网格与响应式画板。</p>
                  <div className="pt-2 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                    <span className="text-[#a7ffd4] opacity-0 group-hover:opacity-100 transition-opacity">点击创建 →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Shortcuts & User Guide */}
        {activeTab === "shortcuts" && (
          <div className="flex-1 p-8 max-w-4xl w-full mx-auto space-y-6">
            <div className="rounded-2xl border border-white/10 bg-neutral-900/30 p-6 space-y-4">
              <h2 className="text-xs font-semibold text-white flex items-center gap-2">
                <span>常用快捷键速查表</span>
                <span className="text-xs font-normal text-neutral-500 font-mono">(Photoshop / Figma 习惯)</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {SHORTCUTS_LIST.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-900/60 border border-white/10 text-xs">
                    <span className="text-neutral-400">{item.desc}</span>
                    <span className="font-mono text-neutral-200 bg-neutral-800 px-2 py-0.5 rounded-lg border border-white/10">
                      {item.key}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-neutral-900/20 p-6 space-y-2 text-xs text-neutral-400">
              <h3 className="font-semibold text-neutral-200">关于 .voo 工程文件格式</h3>
              <p>
                VOO Design 采用自包含的 <code className="text-[#a7ffd4] font-mono">.voo</code> 工程格式，内嵌当前工程的所有画板结构、矢量贝塞尔节点、图层蒙版、3D 空间坐标以及引用的图片素材。文件可自由拷贝至任意设备无缝双向打开。
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
