/** Quick selection actions, AI repaint, and advanced selection modifications. */

import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import {
  StaticSection,
  CollapsibleSection,
} from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";
import { IconSparkle } from "../../icons.jsx";

export default function SelectionActions({
  hasSelection = false,
  onInvertSelection,
  onClearSelection,
  onTransformSelection,
  onFillSelection,
  onRefineEdge,
  selectionTransforming = false,
  onApplyTransformSelection,
  onCancelTransformSelection,
  onAiRepaintSelection,
  aiRepainting = false,
  onModifySelection,
}) {
  const { t } = useI18n();
  const [modifyAmount, setModifyAmount] = useState(4);
  const [aiRepaintPrompt, setAiRepaintPrompt] = useState("");

  if (!hasSelection) return null;

  return (
    <>
      {/* Quick Selection Actions (Only shown when an active selection exists) */}
      <StaticSection title={t("editor.selection.actions")}>
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {onInvertSelection && (
              <button
                type="button"
                onClick={() => onInvertSelection()}
                className="rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#282828] hover:text-white transition-colors"
              >
                {t("editor.selection.invert")}
              </button>
            )}
            {onClearSelection && (
              <button
                type="button"
                onClick={() => onClearSelection()}
                className="rounded-xl bg-rose-500/15 py-1.5 text-[10px] font-mono text-rose-300 hover:bg-rose-500/25 transition-colors"
              >
                {t("editor.selection.deselect")}
              </button>
            )}
            {onTransformSelection && (
              <button
                type="button"
                onClick={() => onTransformSelection()}
                className="rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#282828] hover:text-white transition-colors"
              >
                {t("editor.selection.transform")}
              </button>
            )}
            {onFillSelection && (
              <button
                type="button"
                onClick={() => onFillSelection()}
                className="rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#282828] hover:text-white transition-colors"
              >
                {t("editor.selection.fill")}
              </button>
            )}
          </div>

          {onRefineEdge && (
            <button
              type="button"
              onClick={() => onRefineEdge()}
              className="w-full rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-200 hover:bg-[#282828] hover:text-white transition-colors"
            >
              {t("editor.selection.refineEdge")}
            </button>
          )}

          {selectionTransforming && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onApplyTransformSelection?.()}
                className="rounded-xl bg-emerald-500/15 py-1.5 text-[10px] font-mono text-emerald-300 hover:bg-emerald-500/25 transition-colors"
              >
                {t("editor.selection.applyTransform")}
              </button>
              <button
                type="button"
                onClick={() => onCancelTransformSelection?.()}
                className="rounded-xl bg-rose-500/15 py-1.5 text-[10px] font-mono text-rose-300 hover:bg-rose-500/25 transition-colors"
              >
                {t("editor.selection.cancelTransform")}
              </button>
            </div>
          )}
        </div>
      </StaticSection>

      {/* AI Repaint (if active selection) */}
      {onAiRepaintSelection && (
        <CollapsibleSection
          title={t("editor.selection.aiRepaint")}
          defaultOpen={false}
        >
          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              value={aiRepaintPrompt}
              onChange={(e) => setAiRepaintPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  aiRepaintPrompt.trim() &&
                  !aiRepainting
                ) {
                  onAiRepaintSelection(aiRepaintPrompt.trim());
                }
              }}
              placeholder={t("editor.selection.aiRepaintPlaceholder")}
              disabled={aiRepainting}
              aria-label={t("editor.selection.aiRepaintPlaceholder")}
              className="w-full rounded-xl bg-[#222222] px-3 py-1.5 text-[11px] font-mono text-neutral-100 outline-none transition-all placeholder:text-neutral-400 focus:bg-[#2a2a2a] focus:ring-1 focus:ring-white/20 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => {
                if (aiRepaintPrompt.trim() && !aiRepainting) {
                  onAiRepaintSelection(aiRepaintPrompt.trim());
                }
              }}
              disabled={aiRepainting || !aiRepaintPrompt.trim()}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#E5B2FF] py-1.5 text-[10px] font-mono font-medium text-black hover:bg-[#eed0ff] transition-all disabled:opacity-50"
            >
              <IconSparkle size={13} className="text-black shrink-0" />
              <span>
                {aiRepainting
                  ? t("editor.selection.aiRepaintRunning")
                  : t("editor.selection.aiRepaint")}
              </span>
            </button>
          </div>
        </CollapsibleSection>
      )}

      {/* Advanced Selection Modify (Expand, Contract, Border, Smooth) */}
      {onModifySelection && (
        <CollapsibleSection
          title={t("editor.selection.modify")}
          defaultOpen={false}
        >
          <div className="space-y-1.5">
            <ScrubField
              prefix={
                <svg
                  className="w-3.5 h-3.5 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 3v18M3 12h18" />
                  <circle cx="12" cy="12" r="7" />
                </svg>
              }
              suffix="px"
              min={1}
              max={100}
              value={modifyAmount}
              onValueChange={setModifyAmount}
              ariaLabel={t("editor.selection.modify.amount")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => onModifySelection(modifyAmount, "expand")}
                disabled={modifyAmount <= 0}
                className="rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#282828] hover:text-white transition-colors disabled:opacity-40"
              >
                {t("editor.selection.modify.expand")}
              </button>
              <button
                type="button"
                onClick={() => onModifySelection(modifyAmount, "contract")}
                disabled={modifyAmount <= 0}
                className="rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#282828] hover:text-white transition-colors disabled:opacity-40"
              >
                {t("editor.selection.modify.contract")}
              </button>
              <button
                type="button"
                onClick={() => onModifySelection(modifyAmount, "border")}
                disabled={modifyAmount <= 0}
                className="rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#282828] hover:text-white transition-colors disabled:opacity-40"
              >
                {t("editor.selection.modify.border")}
              </button>
              <button
                type="button"
                onClick={() => onModifySelection(modifyAmount, "smooth")}
                disabled={modifyAmount <= 0}
                className="rounded-xl bg-[#222222] py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#282828] hover:text-white transition-colors disabled:opacity-40"
              >
                {t("editor.selection.modify.smooth")}
              </button>
            </div>
          </div>
        </CollapsibleSection>
      )}
    </>
  );
}

SelectionActions.propTypes = {
  hasSelection: PropTypes.bool,
  onInvertSelection: PropTypes.func,
  onClearSelection: PropTypes.func,
  onTransformSelection: PropTypes.func,
  onFillSelection: PropTypes.func,
  onRefineEdge: PropTypes.func,
  selectionTransforming: PropTypes.bool,
  onApplyTransformSelection: PropTypes.func,
  onCancelTransformSelection: PropTypes.func,
  onAiRepaintSelection: PropTypes.func,
  aiRepainting: PropTypes.bool,
  onModifySelection: PropTypes.func,
};
