import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconClose,
  IconExpand,
  IconChevronLeft,
  IconChevronRight,
  IconCollapse,
} from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";

const controlClass =
  "flex h-9 min-w-9 items-center justify-center gap-2 rounded-lg bg-white/[0.06] px-2 text-[11px] text-neutral-200 transition-colors hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";

function isTypingTarget(target, key) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      (target.tagName === "BUTTON" && [" ", "Spacebar"].includes(key)))
  );
}

/** Read-only presentation surface. The host renders each page through EditorPage. */
export default function PresentationViewer({
  pages,
  initialPageId,
  title,
  onClose,
  renderSlide,
}) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [activePageId, setActivePageId] = useState(
    initialPageId ?? pages[0]?.id,
  );
  const [showNotes, setShowNotes] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [slidePickerOpen, setSlidePickerOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, [elapsedSeconds]);

  const pageIndex = Math.max(
    0,
    pages.findIndex((page) => page.id === activePageId),
  );
  const page = pages[pageIndex] ?? null;
  const nextPage = pages[pageIndex + 1] ?? null;
  const nextLabel = nextPage
    ? t("presentation.viewer.nextSlide", {
        title:
          nextPage.title ||
          t("presentation.page", { number: pageIndex + 2 }),
      })
    : null;
  const pageLabel = useMemo(
    () =>
      t("presentation.viewer.position", {
        current: pageIndex + 1,
        total: pages.length,
      }),
    [pageIndex, pages.length, t],
  );

  const goTo = useCallback(
    (nextIndex) => {
      const boundedIndex = Math.max(0, Math.min(pages.length - 1, nextIndex));
      const targetPage = pages[boundedIndex];
      if (targetPage) setActivePageId(targetPage.id);
    },
    [pages],
  );

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    dialogRef.current?.focus({ preventScroll: true });
    return () => previousFocusRef.current?.focus?.({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!pages.some((entry) => entry.id === activePageId)) {
      setActivePageId(pages[0]?.id);
    }
  }, [activePageId, pages]);

  useEffect(() => {
    const syncFullscreen = () =>
      setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const focusable = [
          ...dialog.querySelectorAll(
            'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ];
        if (!focusable.length) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !dialog.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !dialog.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (
        !dialog.contains(event.target) ||
        isTypingTarget(event.target, event.key)
      )
        return;
      if (
        ["ArrowRight", "ArrowDown", " ", "Spacebar", "PageDown"].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        goTo(pageIndex + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        goTo(pageIndex - 1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        event.stopImmediatePropagation();
        goTo(event.key === "Home" ? 0 : pages.length - 1);
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [goTo, onClose, pageIndex, pages.length]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await dialogRef.current?.requestFullscreen?.();
  };

  if (!page) return null;
  return createPortal(
    <div
      ref={dialogRef}
      data-presentation-overlay
      role="dialog"
      aria-modal="true"
      aria-label={title || t("presentation.viewer.title")}
      tabIndex={-1}
      className="fixed inset-0 z-[200] flex flex-col bg-black text-neutral-100 outline-none"
      data-testid="presentation-viewer"
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-4">
        <div className="min-w-0 truncate text-[12px] text-neutral-200">
          {title || t("presentation.viewer.title")}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] tabular-nums text-neutral-300"
            title={t("presentation.viewer.timer")}
            aria-label={t("presentation.viewer.timer")}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{formattedTime}</span>
          </div>
          <div className="relative">
            <button
              type="button"
              className={controlClass}
              onClick={() => setSlidePickerOpen((v) => !v)}
              aria-label={t("presentation.viewer.selectSlide")}
              aria-expanded={slidePickerOpen}
              title={t("presentation.viewer.selectSlide")}
            >
              <span aria-live="polite" className="tabular-nums">
                {pageLabel}
              </span>
            </button>
            {slidePickerOpen ? (
              <div
                data-presentation-overlay
                className="absolute right-0 top-full z-[210] mt-1 max-h-64 w-52 overflow-y-auto rounded-xl bg-[#141414] p-1 shadow-panel"
              >
                {pages.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                      p.id === activePageId
                        ? "bg-white/[0.12] text-white font-medium"
                        : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                    }`}
                    onClick={() => {
                      setActivePageId(p.id);
                      setSlidePickerOpen(false);
                    }}
                  >
                    <span className="truncate">
                      {p.title || t("presentation.page", { number: idx + 1 })}
                    </span>
                    <span className="tabular-nums text-neutral-500">
                      {idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={controlClass}
            onClick={toggleFullscreen}
            aria-label={t(
              fullscreen
                ? "presentation.viewer.exitFullscreen"
                : "presentation.viewer.fullscreen",
            )}
            title={t(
              fullscreen
                ? "presentation.viewer.exitFullscreen"
                : "presentation.viewer.fullscreen",
            )}
          >
            {fullscreen ? <IconCollapse size={15} /> : <IconExpand size={15} />}
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={onClose}
            aria-label={t("presentation.viewer.close")}
            title={t("presentation.viewer.close")}
          >
            <IconClose size={15} />
          </button>
        </div>
      </header>
      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-3">
        <div
          data-presentation-slide-stage
          className="relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden"
          aria-label={page.title || pageLabel}
          onClick={() => goTo(pageIndex + 1)}
        >
          {renderSlide(page, pageIndex)}
          {showNotes && page.notes ? (
            <div
              className="absolute bottom-3 left-1/2 max-h-32 w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 overflow-y-auto overflow-x-hidden whitespace-pre-wrap rounded-xl bg-[#141414]/95 px-3 py-2 text-[12px] text-neutral-200 shadow-pop"
              aria-label={t("presentation.viewer.notes")}
              onClick={(event) => event.stopPropagation()}
            >
              {page.notes}
            </div>
          ) : null}
        </div>
      </main>
      <footer className="flex min-h-14 shrink-0 items-center justify-center gap-2 px-4 pb-3">
        <button
          type="button"
          className={controlClass}
          disabled={pageIndex === 0}
          onClick={() => goTo(pageIndex - 1)}
          aria-label={t("presentation.viewer.previous")}
          title={t("presentation.viewer.previous")}
        >
          <IconChevronLeft size={15} />
          <span>{t("presentation.viewer.previous")}</span>
        </button>
        {page.notes ? (
          <button
            type="button"
            className={controlClass}
            aria-pressed={showNotes}
            onClick={() => setShowNotes((value) => !value)}
          >
            {t(
              showNotes
                ? "presentation.viewer.hideNotes"
                : "presentation.viewer.showNotes",
            )}
          </button>
        ) : null}
        <button
          type="button"
          className={controlClass}
          disabled={pageIndex === pages.length - 1}
          onClick={() => goTo(pageIndex + 1)}
          aria-label={t("presentation.viewer.next")}
          title={t("presentation.viewer.next")}
        >
          <span>{t("presentation.viewer.next")}</span>
          <IconChevronRight size={15} />
        </button>
        {nextLabel ? (
          <span
            aria-label={nextLabel}
            className="ml-2 hidden max-w-xs truncate text-[11px] text-neutral-400 sm:inline-block"
          >
            {nextLabel}
          </span>
        ) : null}
      </footer>
    </div>,
    document.body,
  );
}

PresentationViewer.propTypes = {
  pages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string,
      notes: PropTypes.string,
      doc: PropTypes.object,
    }),
  ).isRequired,
  initialPageId: PropTypes.string,
  title: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  renderSlide: PropTypes.func.isRequired,
};
