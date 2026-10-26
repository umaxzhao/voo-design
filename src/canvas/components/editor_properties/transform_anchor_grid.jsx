/** 3x3 reference point grid selector for transform positioning and pinning. */

import PropTypes from "prop-types";
import { ANCHOR_KEYS } from "../../editor/scene_geometry.js";

/**
 * The 3×3 reference-point selector: the anchor is the point of the box that
 * numeric X/Y edits position and that W/H edits keep pinned (Figma/Photopea
 * semantics). It lives in component state only — a session preference, never
 * serialised into the document.
 */
export default function AnchorPointGrid({ value, onChange, label }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      title={label}
      className="grid shrink-0 h-14 w-14 grid-cols-3 content-center items-center justify-items-center rounded-xl bg-neutral-800 p-2"
    >
      {ANCHOR_KEYS.map((key) => {
        const isSelected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            onClick={() => onChange(key)}
            className={`flex h-3.5 w-3.5 items-center justify-center rounded-full transition-all ${
              isSelected ? "cursor-default" : "cursor-pointer hover:scale-125"
            }`}
          >
            <span
              className={`rounded-full transition-all ${
                isSelected
                  ? "h-1.5 w-1.5 bg-[#a7ffd4]"
                  : "h-1 w-1 bg-neutral-600 hover:bg-neutral-300"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

AnchorPointGrid.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
};
