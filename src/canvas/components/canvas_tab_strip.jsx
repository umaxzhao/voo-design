import React from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { documentLabel } from "./canvas_tab_label.js";
import { useTabBarOverflow } from "./use_tab_bar_overflow.js";

/**
 * Desktop project tabs.
 *
 * One row that never wraps: the titles stay narrow, the edges expose the ones
 * that do not fit, and the creation entry sits outside the scrolling area so
 * it cannot be pushed off the bar by a growing project list.
 */
export default function CanvasTabStrip({
  documents,
  activeId,
  fileName,
  isDirty,
  welcomeOpen,
  onSwitch,
  onClose,
  onNew,
}) {
  const { t } = useI18n();
  const { scrollRef, canScrollLeft, canScrollRight, scrollByStep } =
    useTabBarOverflow({ activeId, tabCount: documents.length });

  const scrollButton = (direction) => {
    const isLeft = direction < 0;
    const Icon = isLeft ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        data-testid={isLeft ? "tabs-scroll-left" : "tabs-scroll-right"}
        onClick={() => scrollByStep(direction)}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-white/60 outline-none transition-colors hover:bg-neutral-800/75 hover:text-white"
        title={t(isLeft ? "canvasTabs.scrollLeft" : "canvasTabs.scrollRight")}
        aria-label={t(isLeft ? "canvasTabs.scrollLeft" : "canvasTabs.scrollRight")}
        style={{ WebkitAppRegion: "no-drag" }}
      >
        <Icon size={14} strokeWidth={2.2} />
      </button>
    );
  };

  return (
    <div
      className="canvas-tab-bar-desktop flex min-w-0 flex-1 items-center gap-1"
      style={{ WebkitAppRegion: "no-drag" }}
    >
      {canScrollLeft ? scrollButton(-1) : null}
      <div
        ref={scrollRef}
        role="tablist"
        aria-label={t("canvasTabs.label")}
        className="relative flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar"
      >
        {documents.map((document) => {
          const active = document.id === activeId;
          const label = documentLabel(document, active, fileName);
          const dirty = active ? isDirty : document.isDirty;
          return (
            <div
              key={document.id}
              data-tab-id={document.id}
              className={`group flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-full pr-1.5 text-[12px] transition-colors ${
                active && !welcomeOpen
                  ? "bg-neutral-800/75 text-white"
                  : "bg-neutral-800/50 text-white/85 hover:bg-neutral-800/75 hover:text-white"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active && !welcomeOpen}
                onClick={() => onSwitch(document.id)}
                className="h-full min-w-0 max-w-[160px] flex-1 truncate pl-3 text-left outline-none cursor-pointer font-medium"
                title={label}
              >
                {label}
              </button>
              {dirty ? (
                <span
                  role="img"
                  aria-label={t("canvasTabs.unsaved")}
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                  title={t("canvasTabs.unsaved")}
                />
              ) : null}
              <button
                type="button"
                onClick={() => onClose(document.id)}
                className="group/close -m-1.5 flex size-7 shrink-0 items-center justify-center text-white/50 hover:text-white transition-colors cursor-pointer"
                style={{ WebkitAppRegion: "no-drag" }}
                title={t("canvasTabs.close")}
                aria-label={t("canvasTabs.close")}
              >
                <span className="flex size-4 items-center justify-center rounded-full transition-colors group-hover/close:bg-white/20">
                  <X size={12} strokeWidth={2.2} />
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {canScrollRight ? scrollButton(1) : null}
      {/* Creation lives with the open projects: the home screen offers its own. */}
      {documents.length > 0 ? (
        <button
          type="button"
          onClick={onNew}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-800/50 text-white outline-none hover:bg-neutral-800/75 transition-colors cursor-pointer"
          title={t("canvasTabs.new")}
          aria-label={t("canvasTabs.new")}
        >
          <Plus size={14} strokeWidth={2.2} />
        </button>
      ) : null}
    </div>
  );
}
