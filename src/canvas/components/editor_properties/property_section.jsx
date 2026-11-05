import PropTypes from "prop-types";
import { useState } from "react";
import { IconChevronDown } from "../../icons.jsx";
import { loadEditorPanelSectionState, toggleEditorPanelSectionState } from "../editor_panel_preferences.js";

/** Shared input skin for every field in the panel. */
export const fieldClass =
  "inspector-field h-7 w-full rounded-xl bg-neutral-800 px-2.5 text-[11px] font-mono tabular-nums text-neutral-100 outline-none transition-colors hover:bg-neutral-800/80";

/**
 * Section titles share a scope hook; the inspector applies readable label
 * typography without changing other surfaces that reuse these primitives.
 */
export const sectionTitleClass =
  "inspector-section-title max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-mono font-medium text-neutral-400 uppercase tracking-[0.14em]";

/** The separator and vertical rhythm every section in the panel shares. */
// One vertical rhythm separates groups through whitespace, without rules.
const sectionRhythmClass =
  "pb-3 pt-1.5 first:pt-0";
const emptySectionRhythmClass = "py-3";

/** The header row shared by static and collapsible sections. */
export const sectionHeaderClass =
  "flex min-w-0 items-center justify-between gap-2 px-1 pb-2 select-none";
const emptySectionHeaderClass =
  "flex min-w-0 items-center justify-between gap-2 px-1 select-none";

/** The child wrapper shared by every section, so all rows share one inset. */
export const sectionBodyClass = "space-y-2 px-0.5";

/**
 * A full-width input row: the same height and horizontal inset as the fields
 * built on `ScrubField`, so paint rows and transform rows line up exactly.
 */
export const sectionRowClass =
  "inspector-row flex h-7 w-full min-w-0 items-center gap-2 rounded-xl bg-neutral-800 px-2.5 transition-colors hover:bg-neutral-800/80";

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
 * A full-width "nothing here yet" row: the empty state for a paint/effect
 * section, so the section shows a clear action instead of a bare header.
 */
export function SectionEmptyRow({
  label,
  onClick,
  icon = null,
  testId = undefined,
  showPlus = true,
  variant = "action",
  ariaLabel = null,
}) {
  const isPlaceholder = variant === "empty";
  return (
    <button
      type="button"
      onClick={onClick}
      data-inspector-control="action"
      aria-label={ariaLabel ?? label}
      data-testid={testId}
      className={
        isPlaceholder
          ? "flex h-7 w-full items-center justify-center rounded-xl bg-white/[0.02] text-[10px] font-mono tracking-wide text-neutral-500 transition-colors hover:bg-white/[0.05] hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          : `${sectionRowClass} justify-start text-[11px] text-neutral-400 hover:text-neutral-200`
      }
    >
      {isPlaceholder ? (
        <span className="truncate">{label}</span>
      ) : (
        <>
          {icon ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {showPlus ? (
            <span aria-hidden="true" className="text-[12px] font-mono text-neutral-500">+</span>
          ) : null}
        </>
      )}
    </button>
  );
}

SectionEmptyRow.propTypes = {
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  icon: PropTypes.node,
  testId: PropTypes.string,
  /** Hide the trailing "+" when the section header already exposes the add action. */
  showPlus: PropTypes.bool,
  /** "empty" renders a centred, nearly transparent placeholder instead of an add row. */
  variant: PropTypes.oneOf(["action", "empty"]),
  /** Accessible action label when the visible text is just "Empty". */
  ariaLabel: PropTypes.string,
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
    <div data-inspector-section className={sectionRhythmClass} data-testid={testId}>
      <div className={sectionHeaderClass}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`${title} section`}
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
export function StaticSection({
  title,
  children = null,
  extra = null,
  storageKey = null,
  testId = undefined,
  hideHeader = false,
  bodyClassName = sectionBodyClass,
  emptyState = false,
  defaultOpen = true,
}) {
  if (hideHeader) {
    return (
      <div
        data-inspector-section
        className={emptyState ? emptySectionRhythmClass : sectionRhythmClass}
        data-testid={testId}
      >
        <div className={bodyClassName}>{children}</div>
      </div>
    );
  }
  if (emptyState) {
    return (
      <div
        data-inspector-section
        className={emptySectionRhythmClass}
        data-testid={testId}
      >
        <div className={emptySectionHeaderClass}>
          <div className={`flex min-w-0 items-center gap-1.5 ${sectionTitleClass}`}>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{title}</span>
          </div>
          {extra ? <div className="flex shrink-0 items-center gap-2">{extra}</div> : null}
        </div>
        <div className={bodyClassName}>{children}</div>
      </div>
    );
  }
  return (
    <CollapsibleSection
      title={title}
      defaultOpen={defaultOpen}
      extra={extra}
      storageKey={storageKey}
      testId={testId}
    >
      <div className={bodyClassName}>{children}</div>
    </CollapsibleSection>
  );
}

StaticSection.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  extra: PropTypes.node,
  storageKey: PropTypes.string,
  emptyState: PropTypes.bool,
};
