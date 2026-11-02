import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";

const actionClass =
  "min-h-9 rounded-lg px-3 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/** Export confirmation and result surface for the existing export entry point. */
export default function PresentationExportDialog({
  busy = false,
  onClose,
  onExport,
  warnings = [],
  error = null,
}) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const [format, setFormat] = useState("pptx");

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...dialog.querySelectorAll(
          "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (!controls.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [busy, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4">
      <section
        ref={dialogRef}
        data-presentation-overlay
        role="dialog"
        aria-modal="true"
        aria-labelledby="presentation-export-heading"
        aria-busy={busy}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-[#141414] p-4 shadow-panel outline-none"
      >
        <header className="flex items-center justify-between gap-3">
          <h2
            id="presentation-export-heading"
            className="text-[12px] font-medium text-neutral-100"
          >
            {t("presentation.export.title")}
          </h2>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4] disabled:opacity-40"
            aria-label={t("presentation.export.close")}
            title={t("presentation.export.close")}
            disabled={busy}
            onClick={onClose}
          >
            <IconClose size={15} />
          </button>
        </header>
        {busy ? (
          <p role="status" className="text-[11px] text-neutral-400">
            {t("presentation.export.busy")}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-rose-500/10 px-3 py-2 text-[11px] text-rose-400"
          >
            {error}
          </p>
        ) : null}
        {warnings.length ? (
          <section
            aria-label={t("presentation.export.warnings")}
            className="flex flex-col gap-2"
          >
            <h3 className="text-[11px] text-neutral-300">
              {t("presentation.export.warnings")}
            </h3>
            <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto overflow-x-hidden">
              {warnings.map((warning) => (
                <li
                  key={`${warning.pageId}:${warning.reason}`}
                  className="min-w-0 text-[10px] text-neutral-400"
                >
                  <span className="text-neutral-200">{warning.title}</span>
                  <span>: {t("presentation.rasterized")}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-neutral-300">
            {t("presentation.export.format")}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`flex h-9 items-center justify-center rounded-lg text-[11px] font-medium transition-colors ${
                format === "pptx"
                  ? "bg-white text-black"
                  : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12] hover:text-white"
              }`}
              disabled={busy}
              onClick={() => setFormat("pptx")}
            >
              {t("presentation.export.pptx")}
            </button>
            <button
              type="button"
              className={`flex h-9 items-center justify-center rounded-lg text-[11px] font-medium transition-colors ${
                format === "pdf"
                  ? "bg-white text-black"
                  : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12] hover:text-white"
              }`}
              disabled={busy}
              onClick={() => setFormat("pdf")}
            >
              {t("presentation.export.pdf")}
            </button>
          </div>
        </div>
        <footer className="flex justify-end gap-2">
          <button
            type="button"
            className={`${actionClass} bg-white/[0.06] text-neutral-200 hover:bg-white/[0.12]`}
            disabled={busy}
            onClick={onClose}
          >
            {t("presentation.export.cancel")}
          </button>
          <button
            type="button"
            className={`${actionClass} bg-white text-black hover:bg-neutral-200`}
            disabled={busy}
            onClick={() => onExport(format)}
          >
            {t(
              busy
                ? "presentation.export.busy"
                : format === "pdf"
                  ? "presentation.export.startPdf"
                  : "presentation.export.start",
            )}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

PresentationExportDialog.propTypes = {
  busy: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onExport: PropTypes.func.isRequired,
  warnings: PropTypes.arrayOf(
    PropTypes.shape({
      pageId: PropTypes.string.isRequired,
      title: PropTypes.string,
      reason: PropTypes.string.isRequired,
    }),
  ),
  error: PropTypes.string,
};
