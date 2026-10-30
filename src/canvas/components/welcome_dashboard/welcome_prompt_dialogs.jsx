import PropTypes from "prop-types";
import { X, Component, Monitor, Palette, Paperclip, Plus } from "lucide-react";
import { DEFAULT_STYLE_ID } from "./generation-options.js";

export default function WelcomePromptDialogs({
  t,
  styleModalOpen,
  setStyleModalOpen,
  styleId,
  styleOptions,
  onSelectStyle,
  systemModalOpen,
  setSystemModalOpen,
  designSystemId,
  designSystemOptions,
  onSelectDesignSystem,
  sizeModalOpen,
  setSizeModalOpen,
  currentSize,
  sizeOptions,
  onSelectSize,
}) {
  return (
    <>
      {/* Style Selection Modal */}
      {styleModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#171717] p-5 shadow-panel">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-[15px] font-semibold text-neutral-100">
                {t("welcome.prompt.styleLabel")}
              </h3>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setStyleModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid max-h-[60vh] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  onSelectStyle?.(DEFAULT_STYLE_ID);
                  setStyleModalOpen(false);
                }}
                className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center transition-colors ${
                  !styleId || styleId === DEFAULT_STYLE_ID
                    ? "border-[#a7ffd4]/60 bg-[#a7ffd4]/5 text-white"
                    : "border-white/10 text-neutral-400 hover:bg-white/[0.04]"
                }`}
              >
                <span className="text-xs font-medium">
                  {t("welcome.prompt.styleAuto")}
                </span>
                <span className="mt-1 text-[10px] text-neutral-500">
                  {t("welcome.prompt.styleAutoHint")}
                </span>
              </button>
              {(styleOptions ?? []).map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    onSelectStyle?.(style.id);
                    setStyleModalOpen(false);
                  }}
                  className={`flex flex-col rounded-xl border p-2.5 text-left transition-colors ${
                    styleId === style.id
                      ? "border-[#a7ffd4]/60 bg-white/10 text-white ring-1 ring-[#a7ffd4]/30"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  {style.swatch && (
                    <div className="flex gap-1 mb-2">
                      {[...new Set(style.swatch)].map((c) => (
                        <span
                          key={c}
                          className="size-3 rounded-full"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  )}
                  <span className="text-xs font-medium truncate">
                    {style.name}
                  </span>
                  {style.mood && (
                    <span className="text-[10px] text-neutral-500 line-clamp-1 mt-0.5">
                      {style.mood}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Design System Modal */}
      {systemModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#171717] p-5 shadow-panel">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-[15px] font-semibold text-neutral-100">
                {t("welcome.prompt.designSystem")}
              </h3>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setSystemModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
              {(designSystemOptions ?? []).map((system) => (
                <button
                  key={system.id}
                  type="button"
                  onClick={() => {
                    onSelectDesignSystem?.(system.id);
                    setSystemModalOpen(false);
                  }}
                  className={`flex flex-col rounded-xl border p-3 text-left transition-colors ${
                    designSystemId === system.id
                      ? "border-[#a7ffd4]/60 bg-white/10 text-white ring-1 ring-[#a7ffd4]/30"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="text-xs font-semibold">{system.label}</span>
                  {system.description && (
                    <span className="text-[11px] text-neutral-400 mt-1">
                      {system.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Canvas Size Modal */}
      {sizeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#171717] p-5 shadow-panel">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-[15px] font-semibold text-neutral-100">
                {t("welcome.prompt.sizeLabel")}
              </h3>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setSizeModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(sizeOptions ?? []).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onSelectSize?.({
                      width: option.width,
                      height: option.height,
                    });
                    setSizeModalOpen(false);
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-colors ${
                    currentSize.width === option.width &&
                    currentSize.height === option.height
                      ? "border-[#a7ffd4]/60 bg-white/10 text-white ring-1 ring-[#a7ffd4]/30"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="font-mono text-xs">
                    {option.width} × {option.height}
                  </span>
                  {option.label && (
                    <span className="text-[10px] text-neutral-500 mt-0.5">
                      {option.label}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
WelcomePromptDialogs.propTypes = {
  t: PropTypes.func,
  styleModalOpen: PropTypes.bool,
  setStyleModalOpen: PropTypes.func,
  styleId: PropTypes.string,
  styleOptions: PropTypes.array,
  onSelectStyle: PropTypes.func,
  systemModalOpen: PropTypes.bool,
  setSystemModalOpen: PropTypes.func,
  designSystemId: PropTypes.string,
  designSystemOptions: PropTypes.array,
  onSelectDesignSystem: PropTypes.func,
  sizeModalOpen: PropTypes.bool,
  setSizeModalOpen: PropTypes.func,
  currentSize: PropTypes.object,
  sizeOptions: PropTypes.array,
  onSelectSize: PropTypes.func,
};

export function WelcomePromptContext({
  t,
  contextButtonRef,
  contextMenuRef,
  contextOpen,
  setContextOpen,
  onAddAttachments,
  setStyleModalOpen,
  setSystemModalOpen,
  setSizeModalOpen,
}) {
  return (
    <>
      {/* Left: [+] Add to Context Button */}
      <div className="relative">
        <button
          ref={contextButtonRef}
          type="button"
          onClick={() => setContextOpen((o) => !o)}
          className="flex size-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
          title={t("welcome.prompt.addAttachment")}
          aria-label={t("welcome.prompt.addAttachment")}
          aria-haspopup="menu"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
        {contextOpen && (
          <div
            ref={contextMenuRef}
            className="absolute bottom-full left-0 z-50 mb-2 w-52 rounded-xl border border-white/10 bg-[#1a1a1a] p-1.5 shadow-panel backdrop-blur-md"
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              {t("welcome.prompt.addAttachment")}
            </div>
            <button
              type="button"
              onClick={() => {
                setContextOpen(false);
                onAddAttachments?.();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              <Paperclip size={13} className="text-neutral-400" />
              <span>{t("welcome.prompt.addAttachment")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setContextOpen(false);
                setStyleModalOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              <Palette size={13} className="text-neutral-400" />
              <span>{t("welcome.prompt.styleLabel")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setContextOpen(false);
                setSystemModalOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              <Component size={13} className="text-neutral-400" />
              <span>{t("welcome.prompt.designSystem")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setContextOpen(false);
                setSizeModalOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              <Monitor size={13} className="text-neutral-400" />
              <span>{t("welcome.prompt.sizeLabel")}</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
WelcomePromptContext.propTypes = {
  t: PropTypes.func,
  contextButtonRef: PropTypes.object,
  contextMenuRef: PropTypes.object,
  contextOpen: PropTypes.bool,
  setContextOpen: PropTypes.func,
  onAddAttachments: PropTypes.func,
  setStyleModalOpen: PropTypes.func,
  setSystemModalOpen: PropTypes.func,
  setSizeModalOpen: PropTypes.func,
};
