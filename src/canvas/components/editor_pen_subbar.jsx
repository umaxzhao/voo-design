/**
 * Vector-edit modes shown inside the dynamic properties panel while a pen
 * node is open for anchor editing.
 *
 * Paint, Shape builder and Variable width are visible but disabled: the
 * planar-region fill and variable-width stroke engines they need do not
 * exist yet, and a hidden roadmap is worse than a greyed-out one.
 */

import PropTypes from "prop-types";
import { IconCut, IconLasso } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";

const GLYPH_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** Arrow pointer: move the selected anchors. */
function PointerGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 2.6 L4 12.2 L6.6 9.8 L8.4 13.4 L10 12.6 L8.3 9.1 L11.9 9.1 Z"
        strokeWidth="1.4"
        {...GLYPH_STROKE}
      />
    </svg>
  );
}

/** A curve with its node and two handles: adjust the curve's handles. */
function HandlesGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.8 11.6 C5.6 3.8 10.4 12.2 13.2 4.4"
        strokeWidth="1.3"
        {...GLYPH_STROKE}
      />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <circle cx="4.6" cy="6.6" r="1" fill="currentColor" />
      <circle cx="11.4" cy="9.4" r="1" fill="currentColor" />
    </svg>
  );
}

/** Check mark: finish anchor editing. */
function DoneGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.2 8.6 L6.6 12 L12.8 4.6"
        strokeWidth="1.6"
        {...GLYPH_STROKE}
      />
    </svg>
  );
}

const SUB_TOOLS = [
  { id: "move", icon: PointerGlyph, labelKey: "editor.pen.subMove" },
  { id: "lasso", icon: IconLasso, labelKey: "editor.pen.subLasso" },
  { id: "bend", icon: HandlesGlyph, labelKey: "editor.pen.subBend" },
  { id: "cut", icon: IconCut, labelKey: "editor.pen.subCut" },
];

const subbarBtnClass = (active) =>
  `relative rounded-full p-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
    active
      ? "bg-white text-black font-medium"
      : "text-neutral-400 hover:bg-white/10 hover:text-neutral-100"
  }`;

export default function EditorPenSubbar({
  subTool = "move",
  onSubTool,
  onCloseEdit,
}) {
  const { t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("editor.tool.pen")}
      data-testid="editor-pen-subbar"
      className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1 font-mono"
    >
      {SUB_TOOLS.map(({ id, icon: Icon, labelKey }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSubTool(id)}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          aria-pressed={subTool === id}
          className={subbarBtnClass(subTool === id)}
        >
          <Icon size={16} />
        </button>
      ))}

      <div className="mx-0.5 h-4 w-px bg-white/10" />

      <button
        type="button"
        onClick={() => onCloseEdit?.()}
        aria-label={t("editor.pen.closeEdit")}
        title={t("editor.pen.closeEdit")}
        className="rounded-full p-2 text-neutral-400 transition-all hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900"
      >
        <DoneGlyph size={16} />
      </button>
    </div>
  );
}

EditorPenSubbar.propTypes = {
  subTool: PropTypes.oneOf(["move", "lasso", "bend", "cut"]),
  onSubTool: PropTypes.func.isRequired,
  /** Exits the anchor-editing session (the toolbelt's ✕). */
  onCloseEdit: PropTypes.func,
};
