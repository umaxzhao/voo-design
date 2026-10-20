/** Selection mode buttons (replace, union, subtract, intersect). */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";

export default function SelectionModeButtons({
  selectionMode = "replace",
  onSelectionMode,
}) {
  const { t } = useI18n();

  const modes = [
    {
      mode: "replace",
      title: `${t("editor.selection.modeNew")} (Replace)`,
      icon: (
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <rect
            x="2"
            y="2"
            width="12"
            height="12"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      ),
    },
    {
      mode: "union",
      title: `${t("editor.selection.modeAdd")} (⇧ Shift)`,
      icon: (
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <rect
            x="1.5"
            y="1.5"
            width="8.5"
            height="8.5"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
          <rect
            x="6"
            y="6"
            width="8.5"
            height="8.5"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
      ),
    },
    {
      mode: "subtract",
      title: `${t("editor.selection.modeSubtract")} (⌥ Option)`,
      icon: (
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <rect
            x="1.5"
            y="1.5"
            width="8.5"
            height="8.5"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
          <rect
            x="6"
            y="6"
            width="8.5"
            height="8.5"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="currentColor"
            className="text-neutral-500"
          />
        </svg>
      ),
    },
    {
      mode: "intersect",
      title: `${t("editor.selection.modeIntersect")} (⇧⌥ Shift+Option)`,
      icon: (
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <rect
            x="1.5"
            y="1.5"
            width="8.5"
            height="8.5"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
          <rect
            x="6"
            y="6"
            width="8.5"
            height="8.5"
            rx="1"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
          <rect
            x="6"
            y="6"
            width="4"
            height="4"
            fill="currentColor"
            className="text-white"
          />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-[#181818]"
      role="radiogroup"
      aria-label={t("editor.selection.mode")}
    >
      {modes.map(({ mode, title, icon }) => {
        const active = selectionMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            title={title}
            onClick={() => onSelectionMode?.(mode)}
            className={`flex h-7 items-center justify-center rounded-lg transition-all ${
              active
                ? "bg-white text-black"
                : "text-neutral-400 hover:bg-[#282828] hover:text-white"
            }`}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

SelectionModeButtons.propTypes = {
  selectionMode: PropTypes.string,
  onSelectionMode: PropTypes.func,
};
