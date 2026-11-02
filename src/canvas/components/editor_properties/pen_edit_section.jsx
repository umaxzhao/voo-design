/**
 * The right-hand panel while a pen node is open for anchor editing: only
 * pen-related controls. Anchor actions (corner/smooth convert, delete) act on
 * the editor's active anchor through engine callbacks; the colour and
 * stroke-style sections are the same ones the node shows outside edit mode.
 */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import ColourSection from "./colour_section.jsx";
import StrokeStyleSection from "./stroke_style_section.jsx";
import { PenAnchorIcon } from "./stroke_style_icons.jsx";

export default function PenEditSection({
  object,
  edit,
  editAndCommit,
  commitNow = undefined,
  selectedNodes = [],
  getBitmap,
  onConvertAnchor,
  onDeleteAnchor,
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      {/* Active-anchor actions: convert corner ↔ smooth, delete. */}
      <div className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
          {t("editor.pen.anchor")}
        </span>
        <div className="grid flex-1 grid-cols-2 gap-1">
          {["corner", "smooth"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onConvertAnchor?.(type)}
              title={
                type === "corner"
                  ? t("editor.pen.anchorCorner")
                  : t("editor.pen.anchorSmooth")
              }
              aria-label={
                type === "corner"
                  ? t("editor.pen.anchorCorner")
                  : t("editor.pen.anchorSmooth")
              }
              className="flex items-center justify-center gap-1 rounded-lg bg-[#222222] py-1 text-[10px] font-mono text-neutral-400 transition-all hover:bg-[#2a2a2a] hover:text-neutral-200"
            >
              <PenAnchorIcon type={type} size={12} />
              <span>
                {type === "corner"
                  ? t("editor.pen.anchorCorner")
                  : t("editor.pen.anchorSmooth")}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onDeleteAnchor?.()}
          aria-label={t("editor.pen.deleteAnchor")}
          title={t("editor.pen.deleteAnchor")}
          className="flex shrink-0 items-center justify-center gap-1 rounded-lg bg-[#222222] px-2 py-1 text-[10px] font-mono text-neutral-400 transition-all hover:bg-rose-500/20 hover:text-rose-300"
        >
          <PenAnchorIcon type="delete" size={12} />
          <span>{t("editor.pen.deleteAnchor")}</span>
        </button>
      </div>

      <ColourSection
        object={object}
        edit={edit}
        editAndCommit={editAndCommit}
        commitNow={commitNow}
        selectedNodes={selectedNodes}
        getBitmap={getBitmap}
      />

      <StrokeStyleSection
        object={object}
        editAndCommit={editAndCommit}
        commitNow={commitNow}
      />
    </div>
  );
}

PenEditSection.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  /** Interaction-end commit for the continuous (debounced) fields. */
  commitNow: PropTypes.func,
  /** Selected node objects when several are picked (plan 1.9). */
  selectedNodes: PropTypes.array,
  getBitmap: PropTypes.func,
  /** Converts the editor's active anchor: "corner" | "smooth". */
  onConvertAnchor: PropTypes.func,
  /** Deletes the editor's active anchor. */
  onDeleteAnchor: PropTypes.func,
};
