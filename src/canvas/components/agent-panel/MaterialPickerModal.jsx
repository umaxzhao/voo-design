import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconClose,
  IconHeart,
  IconImage,
  IconLayers,
  IconSparkles,
  IconUpload,
  IconCheck,
} from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";
import { listAssets, revokeAssetPreviews } from "../../store/asset_library.js";
import { useWorkflowStore } from "../../store/workflow_store.js";
import { NODE_TYPE } from "../../nodes/types.js";

const TAB_UPLOADS = "uploads";
const TAB_ELEMENTS = "elements";
const TAB_GENERATIONS = "generations";
const TAB_LIKED = "liked";

/**
 * Material & Asset Picker Modal inspired by Higgsfield.
 * Allows picking reference images/assets from local uploads,
 * active canvas elements/nodes, or past generations.
 */
export default function MaterialPickerModal({
  open,
  onClose,
  onSelectAsset,
  onRemoveAsset,
  selectedImages = [],
  onUploadFiles,
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(TAB_UPLOADS);
  const [filter, setFilter] = useState("all");
  const [generations, setGenerations] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const [recentUploads, setRecentUploads] = useState([]);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onClose]);

  // Load generated assets from library when Generations or Liked tab is open
  useEffect(() => {
    if (!open || (activeTab !== TAB_GENERATIONS && activeTab !== TAB_LIKED)) {
      return;
    }
    let cancelled = false;
    setGenLoading(true);
    listAssets({ offset: 0, limit: 36 })
      .then((page) => {
        if (cancelled) {
          revokeAssetPreviews(page.assets);
          return;
        }
        setGenerations(page.assets ?? []);
      })
      .catch(() => {
        if (!cancelled) setGenerations([]);
      })
      .finally(() => {
        if (!cancelled) setGenLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeTab]);

  // Read current canvas elements (image-carrying nodes)
  const canvasNodes = useWorkflowStore((state) => state.nodes ?? []);
  const canvasImageAssets = useMemo(() => {
    const list = [];
    for (const node of canvasNodes) {
      if (node.type === NODE_TYPE.IMAGE || node.type === NODE_TYPE.IMAGE_EDITOR) {
        const url = node.data?.url || node.data?.imageUrl || node.data?.src;
        if (url) {
          list.push({
            id: `canvas-${node.id}`,
            nodeId: node.id,
            name: node.data?.label || node.data?.title || t("agent.material.canvasLayer"),
            url,
          });
        }
      }
    }
    return list;
  }, [canvasNodes, t]);

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    e.target.value = "";
    if (!files.length) return;

    if (onUploadFiles) {
      onUploadFiles(files);
    }

    // Keep track of recent uploads preview in this modal
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const item = {
          id: crypto.randomUUID(),
          name: file.name,
          url: reader.result,
        };
        setRecentUploads((prev) => [item, ...prev]);
        onSelectAsset?.(item);
      };
      reader.readAsDataURL(file);
    }
  };

  const isSelected = useCallback(
    (asset) => {
      return selectedImages.some(
        (img) => img.id === asset.id || (img.url && img.url === asset.url),
      );
    },
    [selectedImages],
  );

  const handleItemClick = (asset) => {
    if (isSelected(asset)) {
      onRemoveAsset?.(asset);
    } else {
      onSelectAsset?.(asset);
    }
  };

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={t("agent.materialPickerTitle")}
      className="absolute bottom-full left-0 right-0 mb-2 z-50 flex max-h-[380px] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 p-3 text-neutral-200 shadow-menu backdrop-blur-xl"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Top Header: Tabs + Close */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab(TAB_UPLOADS)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              activeTab === TAB_UPLOADS
                ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
                : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <IconUpload size={12} />
            <span>{t("agent.uploadsTab")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(TAB_ELEMENTS)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              activeTab === TAB_ELEMENTS
                ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
                : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <IconLayers size={12} />
            <span>{t("agent.elementsTab")}</span>
            {canvasImageAssets.length > 0 && (
              <span className="rounded-full bg-white/[0.08] px-1.5 py-0.2 text-[9px] tabular-nums text-neutral-300">
                {canvasImageAssets.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(TAB_GENERATIONS)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              activeTab === TAB_GENERATIONS
                ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
                : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <IconSparkles size={12} />
            <span>{t("agent.generationsTab")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(TAB_LIKED)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              activeTab === TAB_LIKED
                ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
                : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <IconHeart size={12} />
            <span>{t("agent.likedTab")}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors"
        >
          <IconClose size={13} />
        </button>
      </div>

      {/* Sub-bar Filter */}
      <div className="flex items-center justify-between py-2 text-[10px] text-neutral-400">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("recent")}
            className={`rounded-md px-2 py-0.5 transition-colors ${
              filter === "recent"
                ? "bg-white/10 text-white font-medium"
                : "hover:text-white"
            }`}
          >
            {t("agent.recentFilter")}
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-md px-2 py-0.5 transition-colors ${
              filter === "all"
                ? "bg-white/10 text-white font-medium"
                : "hover:text-white"
            }`}
          >
            {t("agent.allFilter")}
          </button>
        </div>

        {selectedImages.length > 0 && (
          <span className="text-[10px] text-[#eed0ff]">
            {t("agent.materialSelectedCount", { count: selectedImages.length })}
          </span>
        )}
      </div>

      {/* Grid Content Area */}
      <div className="ui-scroll flex-1 overflow-y-auto pr-0.5 min-h-[160px] max-h-[260px]">
        {activeTab === TAB_UPLOADS && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {/* Upload media trigger card */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-2 transition-colors hover:border-[#E5B2FF]/60 hover:bg-[#E5B2FF]/5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-neutral-300 group-hover:bg-[#E5B2FF]/20 group-hover:text-[#eed0ff] transition-colors">
                <IconUpload size={14} />
              </div>
              <span className="text-[10px] font-medium text-neutral-300 group-hover:text-white">
                {t("agent.uploadMedia")}
              </span>
            </button>

            {/* Display local uploaded media */}
            {recentUploads.map((item) => {
              const active = isSelected(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`group relative aspect-square overflow-hidden rounded-xl border bg-black transition-all ${
                    active
                      ? "border-[#E5B2FF] ring-1 ring-[#E5B2FF]"
                      : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                  {active && (
                    <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E5B2FF] text-black">
                      <IconCheck size={10} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {activeTab === TAB_ELEMENTS && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {canvasImageAssets.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-8 text-neutral-500 text-[11px]">
                <IconImage size={24} className="mb-1 opacity-40" />
                <span>{t("agent.noMaterialsFound")}</span>
              </div>
            ) : (
              canvasImageAssets.map((asset) => {
                const active = isSelected(asset);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleItemClick(asset)}
                    className={`group relative aspect-square overflow-hidden rounded-xl border bg-black transition-all ${
                      active
                        ? "border-[#E5B2FF] ring-1 ring-[#E5B2FF]"
                        : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-left text-[9px] truncate text-neutral-300">
                      {asset.name}
                    </div>
                    {active && (
                      <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E5B2FF] text-black">
                        <IconCheck size={10} />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        {activeTab === TAB_GENERATIONS && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {genLoading ? (
              <div className="col-span-full flex items-center justify-center py-8 text-neutral-500 text-[11px]">
                <span>{t("common.loading")}</span>
              </div>
            ) : generations.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-8 text-neutral-500 text-[11px]">
                <IconSparkles size={24} className="mb-1 opacity-40" />
                <span>{t("agent.noMaterialsFound")}</span>
              </div>
            ) : (
              generations.map((asset) => {
                const item = {
                  id: asset.id,
                  name: asset.prompt || asset.id,
                  url: asset.previewUrl,
                };
                const active = isSelected(item);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`group relative aspect-square overflow-hidden rounded-xl border bg-black transition-all ${
                      active
                        ? "border-[#E5B2FF] ring-1 ring-[#E5B2FF]"
                        : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <img
                      src={asset.previewUrl}
                      alt={asset.prompt ?? ""}
                      className="h-full w-full object-cover"
                    />
                    {active && (
                      <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E5B2FF] text-black">
                        <IconCheck size={10} />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        {activeTab === TAB_LIKED && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {generations.filter((g) => g.pinned).length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-8 text-neutral-500 text-[11px]">
                <IconHeart size={24} className="mb-1 opacity-40" />
                <span>{t("agent.noMaterialsFound")}</span>
              </div>
            ) : (
              generations
                .filter((g) => g.pinned)
                .map((asset) => {
                  const item = {
                    id: asset.id,
                    name: asset.prompt || asset.id,
                    url: asset.previewUrl,
                  };
                  const active = isSelected(item);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className={`group relative aspect-square overflow-hidden rounded-xl border bg-black transition-all ${
                        active
                          ? "border-[#E5B2FF] ring-1 ring-[#E5B2FF]"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <img
                        src={asset.previewUrl}
                        alt={asset.prompt ?? ""}
                        className="h-full w-full object-cover"
                      />
                      {active && (
                        <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E5B2FF] text-black">
                          <IconCheck size={10} />
                        </div>
                      )}
                    </button>
                  );
                })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

MaterialPickerModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelectAsset: PropTypes.func,
  onRemoveAsset: PropTypes.func,
  selectedImages: PropTypes.array,
  onUploadFiles: PropTypes.func,
};
