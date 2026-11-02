import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { IconSparkles } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import EditorTooltip from "./editor_tooltip.jsx";
import { ICON_BTN_AI } from "./editor_ai_taskbar_buttons.jsx";

export function useEditorAiCredits() {
  return {
    runsOnCredits: false,
    estimatedCredits: 0,
    estimatedBadgeText: null,
    userCreditsBalance: 0,
    isInsufficient: false,
    checkBeforeRun: () => true,
    openRecharge: () => {},
  };
}

export default function EditorLocalRepaintButton({
  onRepaint,
  busy = false,
  initialOpen = false,
}) {
  const { t } = useI18n();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(initialOpen);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const submit = (event) => {
    event.preventDefault();
    const instruction = prompt.trim();
    if (!instruction || busy || !onRepaint) return;
    onRepaint(instruction);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <EditorTooltip label={t("editor.taskbar.repaint") || "Repaint"}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={ICON_BTN_AI}
          aria-label={t("editor.taskbar.repaint") || "Repaint"}
          disabled={busy}
        >
          <IconSparkles size={12} />
        </button>
      </EditorTooltip>
      {open && (
        <form
          onSubmit={submit}
          className="absolute bottom-full left-0 mb-2 p-2 bg-neutral-900 border border-white/10 rounded-xl shadow-pop flex items-center gap-2 z-50 min-w-[260px]"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("editor.taskbar.repaintPromptPlaceholder") || "Describe changes..."}
            className="flex-1 bg-neutral-800 text-xs text-neutral-100 px-2 py-1.5 rounded-lg border border-white/10 outline-none focus:border-[#E5B2FF]"
            autoFocus
          />
          <button
            type="submit"
            disabled={!prompt.trim() || busy}
            className="px-2.5 py-1.5 text-xs font-medium bg-[#E5B2FF]/10 text-[#eed0ff] hover:bg-[#E5B2FF]/20 rounded-lg transition-colors disabled:opacity-50"
          >
            {t("common.apply") || "Apply"}
          </button>
        </form>
      )}
    </div>
  );
}

EditorLocalRepaintButton.propTypes = {
  onRepaint: PropTypes.func,
  busy: PropTypes.bool,
  initialOpen: PropTypes.bool,
  creditsProps: PropTypes.object,
};
