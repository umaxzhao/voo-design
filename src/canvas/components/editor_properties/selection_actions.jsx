/** Quick selection actions and advanced selection modifications. */

import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import {
  StaticSection,
  CollapsibleSection,
  sectionRowClass,
} from "./property_section.jsx";
import ToolSliderField from "./tool_slider_field.jsx";

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
  onModifySelection,
}) {
  const { t } = useI18n();
  const [modifyAmount, setModifyAmount] = useState(4);

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
                className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
              >
                {t("editor.selection.invert")}
              </button>
            )}
            {onClearSelection && (
              <button
                type="button"
                onClick={() => onClearSelection()}
                className={`${sectionRowClass} justify-center text-[10px] text-rose-300 ring-1 ring-rose-400/20`}
              >
                {t("editor.selection.deselect")}
              </button>
            )}
            {onTransformSelection && (
              <button
                type="button"
                onClick={() => onTransformSelection()}
                className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
              >
                {t("editor.selection.transform")}
              </button>
            )}
            {onFillSelection && (
              <button
                type="button"
                onClick={() => onFillSelection()}
                className={`${sectionRowClass} justify-center text-[10px] text-neutral-300`}
              >
                {t("editor.selection.fill")}
              </button>
            )}
          </div>

          {onRefineEdge && (
            <button
              type="button"
              onClick={() => onRefineEdge()}
              className={`${sectionRowClass} justify-center text-[10px] uppercase tracking-wider text-neutral-200`}
            >
              {t("editor.selection.refineEdge")}
            </button>
          )}

          {selectionTransforming && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onApplyTransformSelection?.()}
                className={`${sectionRowClass} justify-center text-[10px] text-emerald-300 ring-1 ring-emerald-400/20`}
              >
                {t("editor.selection.applyTransform")}
              </button>
              <button
                type="button"
                onClick={() => onCancelTransformSelection?.()}
                className={`${sectionRowClass} justify-center text-[10px] text-rose-300 ring-1 ring-rose-400/20`}
              >
                {t("editor.selection.cancelTransform")}
              </button>
            </div>
          )}
        </div>
      </StaticSection>

      {/* Advanced Selection Modify (Expand, Contract, Border, Smooth) */}
      {onModifySelection && (
        <CollapsibleSection
          title={t("editor.selection.modify")}
          defaultOpen={false}
        >
          <div className="space-y-1.5">
            <ToolSliderField
              label={t("editor.selection.modify.amount")}
              icon={
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 3v18M3 12h18" />
                  <circle cx="12" cy="12" r="7" />
                </svg>
              }
              min={1}
              max={100}
              value={modifyAmount}
              onValueChange={setModifyAmount}
              suffix="px"
              ariaLabel={t("editor.selection.modify.amount")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => onModifySelection(modifyAmount, "expand")}
                disabled={modifyAmount <= 0}
                className={`${sectionRowClass} justify-center px-1 text-[10px] text-neutral-300 disabled:opacity-40`}
              >
                {t("editor.selection.modify.expand")}
              </button>
              <button
                type="button"
                onClick={() => onModifySelection(modifyAmount, "contract")}
                disabled={modifyAmount <= 0}
                className={`${sectionRowClass} justify-center px-1 text-[10px] text-neutral-300 disabled:opacity-40`}
              >
                {t("editor.selection.modify.contract")}
              </button>
              <button
                type="button"
                onClick={() => onModifySelection(modifyAmount, "border")}
                disabled={modifyAmount <= 0}
                className={`${sectionRowClass} justify-center px-1 text-[10px] text-neutral-300 disabled:opacity-40`}
              >
                {t("editor.selection.modify.border")}
              </button>
              <button
                type="button"
                onClick={() => onModifySelection(modifyAmount, "smooth")}
                disabled={modifyAmount <= 0}
                className={`${sectionRowClass} justify-center px-1 text-[10px] text-neutral-300 disabled:opacity-40`}
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
  onModifySelection: PropTypes.func,
};
