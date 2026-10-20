import PropTypes from "prop-types";
import { useState } from "react";
import { IconChevronDown } from "../../icons.jsx";
import { readCollapseState, writeCollapseState } from "./collapse_state.js";

/** Shared input skin for every field in the panel. */
export const fieldClass =
  "h-7 w-full rounded-xl bg-neutral-800 px-2.5 text-[11px] font-mono tabular-nums text-neutral-100 outline-none transition-colors hover:bg-neutral-800/80 focus:ring-1 focus:ring-[#a7ffd4]/40";

/**
 * The one section-title style every group in the panel shares — collapsible
 * or not — strictly matching Design.md: 9px uppercase tracking-[0.14em].
 */
export const sectionTitleClass =
  "text-[9px] font-mono font-medium text-neutral-400 uppercase tracking-[0.14em]";

/** The separator and vertical rhythm every section in the panel shares. */
const sectionRhythmClass =
  "border-t border-white/10 pt-2.5 pb-1 mt-2.5 first:border-t-0 first:pt-0 first:mt-0";

/**
 * One collapsible group in the property panel.
 *
 * The panel is meant to fit without scrolling, so grouping and folding is how
 * it stays inside the stage height rather than growing a scrollbar. A
 * `storageKey` opts the section into remembering its fold across sessions
 * (plan 1.11); callers key it per object kind, e.g. `textStyle.<kind>`.
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  children = null,
  extra = null,
  storageKey = null,
  testId = undefined,
}) {
  const [open, setOpen] = useState(
    storageKey ? readCollapseState(storageKey, defaultOpen) : defaultOpen,
  );
  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (storageKey) writeCollapseState(storageKey, next);
      return next;
    });
  };
  return (
    <div className={sectionRhythmClass} data-testid={testId}>
      <div className="flex items-center justify-between px-1 pb-2 select-none">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`flex items-center gap-1.5 ${sectionTitleClass} hover:text-neutral-200 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 rounded-md`}
        >
          <IconChevronDown
            size={12}
            className={`transition-transform duration-200 ${open ? "" : "-rotate-90 text-neutral-500"}`}
          />
          <span>{title}</span>
        </button>
        {extra ? <div className="flex items-center gap-2">{extra}</div> : null}
      </div>
      {open ? <div className="space-y-2.5 px-0.5">{children}</div> : null}
    </div>
  );
}

CollapsibleSection.propTypes = {
  title: PropTypes.string.isRequired,
  defaultOpen: PropTypes.bool,
  children: PropTypes.node,
  extra: PropTypes.node,
  /** When set, the fold state persists under `voo.props.<storageKey>`. */
  storageKey: PropTypes.string,
  testId: PropTypes.string,
};

/**
 * A group that is always open — the transform box, the align row. Identical
 * title size, separator and spacing to CollapsibleSection; the only
 * difference is there is no chevron and nothing folds away.
 */
export function StaticSection({ title, children = null, extra = null }) {
  return (
    <div className={sectionRhythmClass}>
      <div className="flex items-center justify-between px-1 pb-2 select-none">
        <span className={sectionTitleClass}>{title}</span>
        {extra ? <div className="flex items-center gap-2">{extra}</div> : null}
      </div>
      <div className="space-y-2.5 px-0.5">{children}</div>
    </div>
  );
}

StaticSection.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  extra: PropTypes.node,
};
