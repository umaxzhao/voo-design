import GlobalOverlayPortal from "./global_overlay_portal.jsx";
import PropTypes from "prop-types";
import { memo, useEffect, useState, useRef, useCallback } from "react";
import { IconClose, IconCode, IconCopy, IconCheck } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import { isSvgString } from "../editor/editor_svg.js";

export function handleSvgTextareaKeyDown(
  event,
  { textarea, setSvgText } = {},
) {
  if (event.key === "Tab") {
    if (event.shiftKey) {
      // Allow Shift+Tab to escape the textarea to previous interactive element
      return false;
    }
    event.preventDefault();
    const el = textarea;
    if (!el) return true;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const val = el.value || "";
    const next = `${val.substring(0, start)}  ${val.substring(end)}`;
    if (setSvgText) setSvgText(next);
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    }, 0);
    return true;
  }
  return false;
}

function SvgEditModal({
  isOpen,
  onClose,
  initialSvg = "",
  onApply,
}) {
  const { t } = useI18n();
  const [svgText, setSvgText] = useState(initialSvg);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSvgText(initialSvg || "");
      setError(null);
      setCopied(false);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialSvg]);

  const handleApply = useCallback(() => {
    const trimmed = (svgText || "").trim();
    if (!trimmed || !isSvgString(trimmed)) {
      setError(t("editor.svgModal.invalidSvg"));
      return;
    }
    setError(null);
    onApply?.(trimmed);
    onClose();
  }, [svgText, t, onApply, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        handleApply();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, onClose, handleApply]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(svgText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Swallowed
    }
  };

  const handleTextareaKeyDown = (event) => {
    handleSvgTextareaKeyDown(event, {
      textarea: textareaRef.current,
      setSvgText,
    });
  };

  const surface = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("editor.svgModal.title")}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-2xl max-h-[85vh] flex-col rounded-3xl border border-white/10 bg-[#181818] p-5 shadow-panel text-neutral-200"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <IconCode size={15} className="text-neutral-400" />
            <span className="text-xs font-semibold text-white">
              {t("editor.svgModal.title")}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("editor.svgModal.cancel")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <IconClose size={15} />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-3 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs text-rose-400">
            {error}
          </div>
        )}

        {/* Editor body */}
        <div className="mt-3 flex-1 min-h-0 flex flex-col">
          <textarea
            ref={textareaRef}
            value={svgText}
            onChange={(e) => {
              setSvgText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleTextareaKeyDown}
            spellCheck={false}
            rows={14}
            className="w-full h-80 resize-y rounded-xl bg-black/40 p-3 font-mono text-xs leading-relaxed text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]"
            placeholder="<svg ...>...</svg>"
          />
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between pt-3">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            {copied ? (
              <>
                <IconCheck size={13} className="text-neutral-300" />
                <span>{t("editor.svgModal.copied")}</span>
              </>
            ) : (
              <>
                <IconCopy size={13} />
                <span>{t("editor.svgModal.copy")}</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/10 transition-colors"
            >
              {t("editor.svgModal.cancel")}
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-[#E5B2FF] px-3.5 py-1.5 text-xs font-medium text-black hover:bg-[#eed0ff] transition-colors"
            >
              {t("editor.svgModal.apply")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  return <GlobalOverlayPortal>{surface}</GlobalOverlayPortal>;
}

SvgEditModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  initialSvg: PropTypes.string,
  onApply: PropTypes.func.isRequired,
};

export default memo(SvgEditModal);
