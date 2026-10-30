/**
 * The stroke-style section for pen (vector path) nodes: weight, cap, join,
 * dash pattern (with a custom dash/gap pair), closed-path alignment, miter
 * limit and the variable-width profile — the Figma stroke panel's lower half.
 * Colour and opacity live in the colour section's stroke row.
 *
 * Values are read through normalizeStrokeProps so older documents without the
 * fields show the same defaults the renderer falls back to.
 *
 * A width profile and a dash pattern are mutually exclusive (a ribbon fill
 * cannot be dashed): picking one resets the other, Figma-style.
 */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import {
  STROKE_CAP,
  STROKE_DASH,
  STROKE_JOIN,
  WIDTH_PROFILE,
  normalizeStrokeProps,
} from "../../editor/stroke_style.js";
import {
  StrokeJoinIcon,
  StrokeCapIcon,
  StrokeDashIcon,
} from "./stroke_style_icons.jsx";
import ScrubField from "../scrub_field.jsx";
import CustomSelect from "../custom_select.jsx";

/** One row of a segmented control: label plus mutually exclusive options. */
function SegmentedRow({
  label,
  options,
  value,
  onPick,
  disabled = false,
  columns = 3,
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <div
        className={`grid flex-1 gap-1 ${columns === 4 ? "grid-cols-4" : "grid-cols-3"}`}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.value)}
            title={option.label}
            aria-label={option.label}
            aria-pressed={value === option.value}
            className={`flex h-7 items-center justify-center rounded-lg text-[10px] font-mono transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
              disabled
                ? "cursor-not-allowed bg-neutral-900 text-neutral-500"
                : value === option.value
                  ? "bg-neutral-700 font-medium text-neutral-100 shadow-xs ring-1 ring-white/10"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            }`}
          >
            {option.icon ? option.icon : option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

SegmentedRow.propTypes = {
  label: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      icon: PropTypes.node,
    }),
  ).isRequired,
  value: PropTypes.string.isRequired,
  onPick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  columns: PropTypes.number,
};

/** A labelled numeric scrub field using the unified ScrubField input. */
function NumberRow({ label, min, max, value, onCommit, commitNow, ariaLabel }) {
  const { t } = useI18n();
  return (
    <div className="flex-1 min-w-0">
      <ScrubField
        prefix={label}
        min={min}
        max={max}
        step={1}
        value={Math.round(value)}
        onValueChange={(val) => onCommit(Math.max(min, Math.min(max, val)))}
        onCommit={commitNow}
        ariaLabel={ariaLabel}
        scrubHint={t("editor.props.dragToAdjust")}
      />
    </div>
  );
}

NumberRow.propTypes = {
  label: PropTypes.string.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  value: PropTypes.number.isRequired,
  onCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  ariaLabel: PropTypes.string.isRequired,
};

const CUSTOM_DASH = "custom";

export default function StrokeStyleSection({
  object,
  editAndCommit,
  commitNow = undefined,
}) {
  const { t } = useI18n();
  const style = normalizeStrokeProps(object);
  const weight = Number.isFinite(object.strokeWidth) ? object.strokeWidth : 1;
  // An explicit pattern is the "custom" entry of the segmented control.
  const dashPattern = Array.isArray(style.dash) ? style.dash : null;
  const dashValue = dashPattern ? CUSTOM_DASH : style.dash;

  const row = (
    labelKey,
    table,
    current,
    nodeKey,
    labelStem,
    renderIcon,
    disabled = false,
  ) => (
    <SegmentedRow
      label={t(labelKey)}
      options={Object.values(table).map((value) => ({
        value,
        label: t(
          `editor.strokeStyle.${labelStem}${value[0].toUpperCase()}${value.slice(1)}`,
        ),
        icon: renderIcon ? renderIcon(value) : null,
      }))}
      value={current}
      onPick={(value) => editAndCommit({ [nodeKey]: value })}
      disabled={disabled}
    />
  );

  return (
    <div className="mt-1 flex flex-col gap-1.5 pt-1">
      {row(
        "editor.strokeStyle.join",
        STROKE_JOIN,
        style.join,
        "strokeJoin",
        "join",
        (val) => <StrokeJoinIcon join={val} size={15} />,
      )}
      {row(
        "editor.strokeStyle.cap",
        STROKE_CAP,
        style.cap,
        "strokeCap",
        "cap",
        (val) => <StrokeCapIcon cap={val} size={15} />,
      )}

      {/* Dash: presets plus a custom dash/gap pair. */}
      <SegmentedRow
        label={t("editor.strokeStyle.dash")}
        columns={4}
        options={[...Object.values(STROKE_DASH), CUSTOM_DASH].map((value) => ({
          value,
          label: t(
            `editor.strokeStyle.dash${value[0].toUpperCase()}${value.slice(1)}`,
          ),
          icon: <StrokeDashIcon dash={value} size={15} />,
        }))}
        value={dashValue}
        onPick={(value) =>
          editAndCommit({
            strokeDash:
              value === CUSTOM_DASH
                ? (dashPattern ?? [3 * weight, 2 * weight])
                : value,
          })
        }
      />
      {dashValue === CUSTOM_DASH ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberRow
            label={t("editor.strokeStyle.dashLength")}
            min={0}
            max={200}
            value={dashPattern?.[0] ?? 3 * weight}
            onCommit={(val) =>
              editAndCommit({
                strokeDash: [val, dashPattern?.[1] ?? 2 * weight],
              })
            }
            commitNow={commitNow}
            ariaLabel={t("editor.strokeStyle.dashLength")}
          />
          <NumberRow
            label={t("editor.strokeStyle.dashGap")}
            min={0}
            max={200}
            value={dashPattern?.[1] ?? 2 * weight}
            onCommit={(val) =>
              editAndCommit({
                strokeDash: [dashPattern?.[0] ?? 3 * weight, val],
              })
            }
            commitNow={commitNow}
            ariaLabel={t("editor.strokeStyle.dashGap")}
          />
        </div>
      ) : null}

      {/* Width profile: picking one resets the dash, the two cannot mix. */}
      <div className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
          {t("editor.strokeStyle.widthProfile")}
        </span>
        <div className="relative flex-1 min-w-0">
          <CustomSelect
            value={style.profile}
            onChange={(event) =>
              editAndCommit({
                strokeWidthProfile: event.target.value,
                ...(event.target.value !== WIDTH_PROFILE.UNIFORM
                  ? { strokeDash: "solid" }
                  : {}),
              })
            }
            aria-label={t("editor.strokeStyle.widthProfile")}
            className="w-full appearance-none rounded-lg bg-neutral-800 px-2.5 py-1.5 pr-6 text-[10px] font-mono text-neutral-300 outline-none hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            {Object.values(WIDTH_PROFILE).map((value) => (
              <option
                key={value}
                value={value}
                className="bg-neutral-900 text-neutral-100"
              >
                {t(
                  `editor.strokeStyle.profile${value[0].toUpperCase()}${value.slice(1)}`,
                )}
              </option>
            ))}
          </CustomSelect>
        </div>
      </div>

      {style.join === STROKE_JOIN.MITER ? (
        <NumberRow
          label={t("editor.strokeStyle.miterLimit")}
          min={1}
          max={60}
          value={style.miterLimit}
          onCommit={(val) => editAndCommit({ strokeMiterLimit: val })}
          commitNow={commitNow}
          ariaLabel={t("editor.strokeStyle.miterLimit")}
        />
      ) : null}
    </div>
  );
}

StrokeStyleSection.propTypes = {
  object: PropTypes.object.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  /** Interaction-end commit for the continuous (debounced) fields. */
  commitNow: PropTypes.func,
};
