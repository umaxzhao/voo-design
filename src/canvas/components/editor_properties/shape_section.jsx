/**
 * The shape section for parametric path nodes (polygon, star, arrow/line).
 * Styled to follow Figma/Pen property inspector patterns:
 * - Unified StaticSection container
 * - Full-width dark segmented switch
 * - ScrubField inputs for numeric parameters (sides, points, ratio, size)
 */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { ARROW_CAP, withPolyParams } from "../../editor/shape_geometry.js";
import { arrowheadSize } from "../../editor/render_nodes.js";
import ScrubField from "../scrub_field.jsx";
import { StaticSection } from "./property_section.jsx";

/** The cap glyphs: a shaft with the head it names at the right end. */
const CAP_ICONS = {
  none: <path d="M2 8h12" />,
  [ARROW_CAP.LINES]: (
    <>
      <path d="M1 8h9" />
      <path d="M14 8l-4-3.5M14 8l-4 3.5" />
    </>
  ),
  [ARROW_CAP.TRIANGLE]: (
    <>
      <path d="M1 8h7.5" />
      <path d="M14 8 9.5 4.8v6.4Z" fill="currentColor" stroke="none" />
    </>
  ),
  [ARROW_CAP.CIRCLE]: (
    <>
      <path d="M1 8h6" />
      <circle cx="11" cy="8" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  [ARROW_CAP.DIAMOND]: (
    <>
      <path d="M1 8h5" />
      <path
        d="M13.5 8 10.3 4.8 7 8l3.3 3.2Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
};

export default function ShapeSection({
  object,
  edit,
  editAndCommit,
  commitNow = undefined,
}) {
  const { t } = useI18n();

  if (object.poly === true) {
    const polyKind = object.polyKind ?? "polygon";
    return (
      <StaticSection title={t("editor.shape.title")}>
        <div className="flex flex-col gap-2">
          {/* Segmented Shape Type Switcher */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-900 p-1">
            {["polygon", "star"].map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() =>
                  editAndCommit(withPolyParams(object, { polyKind: kind }))
                }
                className={`h-7 flex items-center justify-center rounded-lg text-[11px] font-mono transition-all focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#a7ffd4] ${
                  polyKind === kind
                    ? "bg-neutral-800 font-medium text-neutral-100 shadow-xs"
                    : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
                }`}
              >
                {t(`editor.shape.${kind}`)}
              </button>
            ))}
          </div>

          {/* Numeric Parameters */}
          {polyKind === "star" ? (
            <div className="grid grid-cols-2 gap-2">
              <ScrubField
                prefix={t("editor.shape.points")}
                min={3}
                max={60}
                step={1}
                value={object.spikes ?? 5}
                onValueChange={(val) =>
                  edit(withPolyParams(object, { spikes: val }))
                }
                onCommit={commitNow}
                ariaLabel={t("editor.shape.points")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
              <ScrubField
                prefix={t("editor.shape.ratio")}
                suffix="%"
                min={5}
                max={98}
                step={1}
                value={Math.round((object.innerRatio ?? 0.382) * 100)}
                onValueChange={(val) =>
                  edit(withPolyParams(object, { innerRatio: val / 100 }))
                }
                onCommit={commitNow}
                ariaLabel={t("editor.shape.ratio")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            </div>
          ) : (
            <ScrubField
              prefix={t("editor.shape.sides")}
              min={3}
              max={60}
              step={1}
              value={object.sides ?? 6}
              onValueChange={(val) =>
                edit(withPolyParams(object, { sides: val }))
              }
              onCommit={commitNow}
              ariaLabel={t("editor.shape.sides")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}
        </div>
      </StaticSection>
    );
  }

  // A line/arrow: the head menu, plus the head size once a head is worn.
  const cap = object.line ? "none" : (object.arrowCap ?? ARROW_CAP.LINES);
  const options = [
    "none",
    ARROW_CAP.LINES,
    ARROW_CAP.TRIANGLE,
    ARROW_CAP.CIRCLE,
    ARROW_CAP.DIAMOND,
  ];
  return (
    <StaticSection title={t("editor.shape.title")}>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-5 gap-1 rounded-xl bg-neutral-900 p-1">
          {options.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={t(
                `editor.shape.head${value[0].toUpperCase()}${value.slice(1)}`,
              )}
              title={t(
                `editor.shape.head${value[0].toUpperCase()}${value.slice(1)}`,
              )}
              onClick={() =>
                editAndCommit(
                  value === "none"
                    ? { arrow: false, line: true }
                    : { arrow: true, line: false, arrowCap: value },
                )
              }
              className={`flex h-7 items-center justify-center rounded-lg transition-all focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#a7ffd4] ${
                cap === value
                  ? "bg-neutral-800 text-neutral-100 shadow-xs"
                  : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
              }`}
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {CAP_ICONS[value]}
              </svg>
            </button>
          ))}
        </div>
        {cap !== "none" ? (
          <ScrubField
            prefix={t("editor.shape.size")}
            suffix="px"
            min={4}
            max={200}
            step={1}
            value={object.arrowSize ?? arrowheadSize(object.strokeWidth ?? 1)}
            onValueChange={(val) => edit({ arrowSize: val })}
            onCommit={commitNow}
            ariaLabel={t("editor.shape.size")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}
      </div>
    </StaticSection>
  );
}

ShapeSection.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  /** Interaction-end commit for the continuous (debounced) fields. */
  commitNow: PropTypes.func,
};
