import PropTypes from "prop-types";
import { useState } from "react";
import { IconChevronDown } from "../../icons.jsx";
import { loadEditorPanelSectionState, toggleEditorPanelSectionState } from "../editor_panel_preferences.js";

/** Shared input skin for every field in the panel. */
export const fieldClass =
  "h-7 w-full rounded-xl bg-neutral-800 px-2.5 text-[11px] font-mono tabular-nums text-neutral-100 outline-none transition-colors hover:bg-neutral-800/80 focus:ring-1 focus:ring-[#a7ffd4]/40";

/**
 * The one section-title style every group in the panel shares — collapsible
 * or not — strictly matching Design.md: 9px uppercase tracking-[0.14em].
 */
export const sectionTitleClass =
  "max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-mono font-medium text-neutral-400 uppercase tracking-[0.14em]";

/** The separator and vertical rhythm every section in the panel shares. */
const sectionRhythmClass =
  "border-t border-white/10 pt-2.5 pb-1 mt-2.5 first:border-t-0 first:pt-0 first:mt-0";

/** The header row shared by static and collapsible sections. */
export const sectionHeaderClass =
  "flex min-w-0 items-center justify-between gap-2 px-1 pb-2 select-none";

/** The child wrapper shared by every section, so all rows share one inset. */
export const sectionBodyClass = "space-y-2.5 px-0.5";

/**
 * A full-width input row: the same height and horizontal inset as the fields
 * built on `ScrubField`, so paint rows and transform rows line up exactly.
 */
export const sectionRowClass =
  "flex h-7 w-full min-w-0 items-center gap-2 rounded-xl bg-neutral-800 px-2.5 transition-colors hover:bg-neutral-800/80";

/** Header "+" and row "−" actions share one quiet, compact shape. */
export const sectionActionClass =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

export function SectionAddButton({ label, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`${sectionActionClass} text-[12px] font-mono ${className}`}
    >
      +
    </button>
  );
}

SectionAddButton.propTypes = {
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  className: PropTypes.string,
};

/**
 * One collapsible group in the property panel.
 *
 * Folding keeps the panel short; the body also scrolls inside its container.
 * The fold is remembered across sessions through editor_panel_preferences;
 * callers key it per object kind where needed, e.g. `textStyle.<kind>`.
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  children = null,
  extra = null,
  storageKey = null,
  testId = undefined,
}) {
  // Callers should pass a stable `storageKey`; the title fallback is
  // locale-dependent, so a language switch would reset that section's fold.
  const sectionStorageKey = storageKey ?? `panel.${title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ".")}`;
  const [open, setOpen] = useState(
    loadEditorPanelSectionState()[sectionStorageKey] ?? defaultOpen,
  );
  const toggle = () => {
    setOpen(toggleEditorPanelSectionState(sectionStorageKey, open));
  };
  return (
    <div className={sectionRhythmClass} data-testid={testId}>
      <div className={sectionHeaderClass}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`relative flex min-w-0 items-center gap-1.5 ${sectionTitleClass} before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-[''] hover:text-neutral-200 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 rounded-md`}
        >
          <IconChevronDown
            size={12}
            className={`shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90 text-neutral-500"}`}
          />
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{title}</span>
        </button>
        {extra ? <div className="flex shrink-0 items-center gap-2">{extra}</div> : null}
      </div>
      {open ? <div className={sectionBodyClass}>{children}</div> : null}
    </div>
  );
}

CollapsibleSection.propTypes = {
  title: PropTypes.string.isRequired,
  defaultOpen: PropTypes.bool,
  children: PropTypes.node,
  extra: PropTypes.node,
  /** Key of this section's fold state in the `voo.editor.panelSections` setting. */
  storageKey: PropTypes.string,
  testId: PropTypes.string,
};

/**
 * A panel group that shares CollapsibleSection's header, spacing and fold
 * persistence (it is expanded by default). Kept as a separate name so call
 * sites read as "fixed group" versus "opt-in fold".
 */
export function StaticSection({ title, children = null, extra = null, storageKey = null }) {
  return <CollapsibleSection title={title} extra={extra} storageKey={storageKey}>{children}</CollapsibleSection>;
}

StaticSection.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  extra: PropTypes.node,
  storageKey: PropTypes.string,
};
