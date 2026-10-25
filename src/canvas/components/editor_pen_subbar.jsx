/**
 * Vector-edit modes shown inside the dynamic properties panel while a pen
 * node is open for anchor editing.
 *
 * Paint, Shape builder and Variable width are visible but disabled: the
 * planar-region fill and variable-width stroke engines they need do not
 * exist yet, and a hidden roadmap is worse than a greyed-out one.
 */

import PropTypes from "prop-types";
import {
  IconBend,
  IconClose,
  IconCut,
  IconLasso,
  IconMove,
} from "../icons.jsx";
import { useI18n } from "../use_i18n.js";

const SUB_TOOLS = [
  { id: "move", icon: IconMove, labelKey: "editor.pen.subMove" },
  { id: "lasso", icon: IconLasso, labelKey: "editor.pen.subLasso" },
  { id: "bend", icon: IconBend, labelKey: "editor.pen.subBend" },
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
        <IconClose size={16} />
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
