/** 3x3 reference point grid selector for transform positioning and pinning. */

import PropTypes from "prop-types";
import { ANCHOR_KEYS } from "../../editor/scene_geometry.js";
import { useI18n } from "../../use_i18n.js";

const ANCHOR_AXES = {
  nw: ["left", "top"],
  n: ["center", "top"],
  ne: ["right", "top"],
  w: ["left", "center"],
  center: ["center", "center"],
  e: ["right", "center"],
  sw: ["left", "bottom"],
  s: ["center", "bottom"],
  se: ["right", "bottom"],
};

const AXIS_ANCHOR = Object.fromEntries(
  Object.entries(ANCHOR_AXES).map(([key, [x, y]]) => [`${x}|${y}`, key]),
);

/**
 * The 3×3 reference-point selector: the anchor is the point of the box that
 * numeric X/Y edits position and that W/H edits keep pinned (Figma/Photopea
 * semantics). It lives in component state only — a session preference, never
 * serialised into the document.
 *
 * The centre crosshair is two independent axis toggles: the horizontal arm
 * centres the anchor on X while keeping Y, the vertical arm centres it on Y
 * while keeping X. Default is no cross selection (top-left dot).
 */
export default function AnchorPointGrid({ value, onChange, label }) {
  const { t } = useI18n();
  const [xAxis, yAxis] = ANCHOR_AXES[value] ?? ANCHOR_AXES.nw;
  const xCentred = xAxis === "center";
  const yCentred = yAxis === "center";
  const changeAxis = (axis, next) => {
    const key = axis === "x"
      ? AXIS_ANCHOR[`${next}|${yAxis}`]
      : AXIS_ANCHOR[`${xAxis}|${next}`];
    if (key) onChange(key);
  };
  const toggleHorizontal = () => changeAxis("x", xCentred ? "left" : "center");
  const toggleVertical = () => changeAxis("y", yCentred ? "top" : "center");

  return (
    <div
      role="group"
      aria-label={label}
      title={label}
      className="grid shrink-0 h-14 w-14 grid-cols-3 content-center items-center justify-items-center rounded-xl bg-neutral-800 p-2"
    >
      {ANCHOR_KEYS.map((key) => {
        const isSelected = value === key;
        if (key === "center") {
          const armClass =
            "absolute z-10 flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/50";
          return (
            <div
              key={key}
              className="relative flex h-3.5 w-3.5 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className={`absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full ${
                  xCentred ? "bg-[#a7ffd4]" : "bg-neutral-500"
                }`}
              />
              <span
                aria-hidden="true"
                className={`absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full ${
                  yCentred ? "bg-[#a7ffd4]" : "bg-neutral-500"
                }`}
              />
              <button
                type="button"
                data-testid="anchor-horizontal-start"
                aria-label={t("editor.props.anchorHorizontal")}
                aria-pressed={xCentred}
                onClick={toggleHorizontal}
                className={`${armClass} left-0 top-1/2 h-3 w-[35%] -translate-y-1/2`}
              />
              <button
                type="button"
                data-testid="anchor-horizontal-end"
                aria-label={t("editor.props.anchorHorizontal")}
                aria-pressed={xCentred}
                onClick={toggleHorizontal}
                className={`${armClass} right-0 top-1/2 h-3 w-[35%] -translate-y-1/2`}
              />
              <button
                type="button"
                data-testid="anchor-vertical-start"
                aria-label={t("editor.props.anchorVertical")}
                aria-pressed={yCentred}
                onClick={toggleVertical}
                className={`${armClass} left-1/2 top-0 h-[35%] w-3 -translate-x-1/2`}
              />
              <button
                type="button"
                data-testid="anchor-vertical-end"
                aria-label={t("editor.props.anchorVertical")}
                aria-pressed={yCentred}
                onClick={toggleVertical}
                className={`${armClass} bottom-0 left-1/2 h-[35%] w-3 -translate-x-1/2`}
              />
            </div>
          );
        }
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
