import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { ICON_STROKE_WIDTH } from "../../icons.jsx";
import { CollapsibleSection } from "../editor_properties/property_section.jsx";
import { Switch } from "../ui/switch.jsx";
import { commitColorPickerChange } from "./three-scene-fields.jsx";

/**
 * Row primitives for the 3D inspector. They give the panel one rhythm:
 * a group header (bare icon, title, fold chevron, optional trailing control)
 * and label-left / control-right rows, instead of a stack of uppercase
 * section titles.
 */

/** A folding group, drawn with Design's own section style. */
export function InspectorGroup({
  title,
  defaultOpen = true,
  extra = null,
  children = null,
  testId = undefined,
}) {
  return (
    <CollapsibleSection
      title={title}
      defaultOpen={defaultOpen}
      extra={extra}
      testId={testId}
    >
      {children}
    </CollapsibleSection>
  );
}

InspectorGroup.propTypes = {
  // Accepted for call-site compatibility; Design's sections carry no icon.
  icon: PropTypes.elementType,
  title: PropTypes.string.isRequired,
  defaultOpen: PropTypes.bool,
  extra: PropTypes.node,
  children: PropTypes.node,
  testId: PropTypes.string,
};

export function InspectorRow({ label, children, className = "" }) {
  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-2 ${className}`}
    >
      <span className="shrink-0 text-[10px] text-neutral-400">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        {children}
      </div>
    </div>
  );
}

InspectorRow.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node,
  className: PropTypes.string,
};

export function SegmentedControl({ value, options, onChange, label }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-lg bg-neutral-900 p-0.5"
    >
      {options.map(({ value: optionValue, label: optionLabel }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(optionValue)}
            className={`rounded-md px-2 py-0.5 text-[10px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
              active
                ? "bg-neutral-800 font-medium text-neutral-100 shadow-xs"
                : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-100"
            }`}
          >
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}

SegmentedControl.propTypes = {
  value: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
};

export { Switch as InspectorSwitch, Switch };

/** A compact color row: swatch + editable hex, matching Spline's BG Color. */
/**
 * A colour swatch plus hex field. `unsetLabel` marks a value that is not
 * applied (a transparent background): the field shows that label instead of
 * a stand-in hex, and any colour the user enters — even the one the swatch
 * happens to show — is applied, since applying it is the change.
 */
export function ColorRow({
  label,
  value,
  onChange,
  onCommit,
  unsetLabel = null,
}) {
  const unset = Boolean(unsetLabel);
  const hex = /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value : "#ffffff";
  const shownDraft = unset ? "" : hex.slice(1).toUpperCase();
  const [draft, setDraft] = useState(shownDraft);
  useEffect(() => setDraft(shownDraft), [shownDraft]);
  const commitDraft = () => {
    const next = `#${draft.trim().replace(/^#/, "")}`;
    if (
      /^#[0-9a-fA-F]{6}$/.test(next) &&
      (unset || next.toLowerCase() !== hex.toLowerCase())
    ) {
      onChange(next);
      onCommit?.();
    } else {
      setDraft(shownDraft);
    }
  };
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="shrink-0 text-[10px] text-neutral-400">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <label className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-md">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-white/15"
          />
          {unset ? (
            // Transparent: an empty swatch struck through, not a fake colour.
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="pointer-events-none absolute inset-0 z-10 h-full w-full rounded-md bg-neutral-800 text-rose-400"
            >
              <line
                x1="3"
                y1="17"
                x2="17"
                y2="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          ) : null}
          <input
            type="color"
            aria-label={label}
            value={hex}
            // Opening the picker on an unset value applies the shown colour
            // first: a native picker fires no change for the colour it opens
            // on, so picking it would otherwise do nothing.
            onClick={
              unset
                ? () => commitColorPickerChange(onChange, onCommit, hex)
                : undefined
            }
            onChange={(event) => {
              commitColorPickerChange(onChange, onCommit, event.target.value);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
        <input
          aria-label={`${label} hex`}
          value={draft}
          placeholder={unsetLabel ?? undefined}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-6 w-16 rounded-md bg-neutral-800 px-1.5 text-[10px] font-mono tracking-wide text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
        />
      </div>
    </div>
  );
}

ColorRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  unsetLabel: PropTypes.string,
};

export function AssetRow({
  label,
  color = null,
  icon: Icon = null,
  selected = false,
  onClick = null,
  trailing = null,
}) {
  return (
    <div
      className={`flex min-h-7 items-center gap-2 rounded-lg px-1.5 text-[11px] transition-colors ${
        selected
          ? "bg-[#E5B2FF]/10 text-[#eed0ff]"
          : "text-neutral-300 hover:bg-white/[0.04]"
      }`}
    >
      {color ? (
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-white/15"
          style={{ background: color }}
        />
      ) : null}
      {Icon ? (
        <Icon
          size={13}
          strokeWidth={ICON_STROKE_WIDTH}
          className="shrink-0 text-neutral-400"
        />
      ) : null}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 truncate py-1.5 text-left"
        >
          {label}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate py-1.5">{label}</span>
      )}
      {trailing ? (
        <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>
      ) : null}
    </div>
  );
}

AssetRow.propTypes = {
  label: PropTypes.string.isRequired,
  color: PropTypes.string,
  icon: PropTypes.elementType,
  selected: PropTypes.bool,
  onClick: PropTypes.func,
  trailing: PropTypes.node,
};

export function EmptyAssets({ label }) {
  return <p className="px-1.5 py-1 text-[10px] text-neutral-500">{label}</p>;
}

EmptyAssets.propTypes = { label: PropTypes.string.isRequired };
