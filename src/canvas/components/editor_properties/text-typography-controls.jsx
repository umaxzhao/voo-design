/** Readable field captions and consistent Lucide controls for typography. */
import PropTypes from "prop-types";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import ScrubField from "../scrub_field.jsx";
import MixedField from "./mixed_field.jsx";
import { loadEditorPanelSectionState, toggleEditorPanelSectionState } from "../editor_panel_preferences.js";

export const TYPE_ICON_PROPS = { size: 16, strokeWidth: 1.5, absoluteStrokeWidth: true, "aria-hidden": true };

export function TextField({ label, children, className = "" }) {
  return (
    <div data-typography-field role="group" aria-label={label} className={`flex min-w-0 flex-col gap-1 [&_input]:!text-[11px] [&_button]:!text-[11px] ${className}`}>
      <span className="!text-[11px] font-medium leading-4 text-neutral-300 break-words">{label}</span>
      <div className="min-w-0 [&>div>button]:!min-h-8 max-md:[&>div>button]:!min-h-12 [&_svg]:size-4 [&_svg]:[stroke-width:2.25]">{children}</div>
    </div>
  );
}
TextField.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export function TextMetricField({
  label,
  icon: Icon,
  unit,
  value,
  min,
  max,
  step = 1,
  precision = 0,
  mixed = false,
  onChange,
  onCommit,
  ariaLabel = label,
  scrubHint,
}) {
  const icon = <Icon {...TYPE_ICON_PROPS} data-typography-icon="" />;
  return (
    <TextField label={label}>
      <div className="[&>div]:!h-8 max-md:[&>div]:!h-12">
        {mixed ? (
          <MixedField
            label={icon}
            suffix={unit}
            min={min}
            max={max}
            precision={precision}
            ariaLabel={ariaLabel}
            onValueChange={onChange}
            commitNow={onCommit}
          />
        ) : (
          <ScrubField
            prefix={icon}
            suffix={unit}
            min={min}
            max={max}
            step={step}
            precision={precision}
            value={value}
            onValueChange={onChange}
            onCommit={onCommit}
            ariaLabel={ariaLabel}
            scrubHint={scrubHint}
          />
        )}
      </div>
    </TextField>
  );
}
TextMetricField.propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  unit: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  precision: PropTypes.number,
  mixed: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  ariaLabel: PropTypes.string,
  scrubHint: PropTypes.string,
};

export function TextToggleButton({ active, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-inspector-control="toggle"
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg px-1 !text-[11px] transition-colors max-md:h-12 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${active ? "bg-white/20 text-neutral-100" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"}`}
    >
      {children}
    </button>
  );
}
TextToggleButton.propTypes = {
  active: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

export function TextOptionsDisclosure({ storageKey, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(() => loadEditorPanelSectionState()[storageKey] ?? defaultOpen);
  const contentId = useId();
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen(toggleEditorPanelSectionState(storageKey, open))}
        aria-expanded={open}
        aria-controls={contentId}
        title={title}
        className="flex min-h-8 w-full items-center gap-2 rounded-lg text-left !text-[11px] text-neutral-400 transition-colors max-md:min-h-12 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        <ChevronDown {...TYPE_ICON_PROPS} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
        <span>{title}</span>
      </button>
      <div id={contentId} hidden={!open} className="space-y-3 pt-2">{children}</div>
    </div>
  );
}
TextOptionsDisclosure.propTypes = {
  storageKey: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  defaultOpen: PropTypes.bool,
  children: PropTypes.node.isRequired,
};
