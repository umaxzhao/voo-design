/**
 * FlatSelect - page-native dropdown replacing native <select>.
 *
 * Renders the same flat, in-app panel as PlatformSelect (dark, rounded-xl,
 * brightness-layered) instead of the browser's system popup, so every
 * dropdown in VOO looks identical across platforms.
 *
 * Supports keyboard navigation (Up/Down/Enter/Escape), click-outside close,
 * and auto up/down expansion based on available space.
 */

import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown } from "../icons.jsx";
import { PopoverScopeContext } from "./popover_scope.js";

const PANEL_CLASS =
  "absolute z-50 overflow-hidden rounded-xl bg-[#181818] p-1 border border-white/10 shadow-menu";

/** Normalize options to {value, label} objects. */
function normalizeOptions(options) {
  return (options || []).map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt,
  );
}

export default function FlatSelect({
  value,
  onChange,
  options,
  label,
  className = "",
  triggerClassName = "",
  panelClassName = "",
  disabled = false,
  widthClass = "min-w-full min-w-[200px] w-max max-w-[min(360px,calc(100vw-32px))] right-0",
  placeholder = null,
  placeholderIcon = null,
  portal = false,
  triggerProps = {},
}) {
  const popoverScope = useContext(PopoverScopeContext);
  const normalized = useMemo(() => normalizeOptions(options), [options]);
  // Keep headings out of the selectable list so keyboard navigation stays model-only.
  const sections = useMemo(() => {
    const result = [];
    for (const option of normalized) {
      const key = option.group?.id ?? option.value;
      const previous = result[result.length - 1];
      if (option.group && previous?.key === key) previous.options.push(option);
      else result.push({ key, group: option.group, options: [option] });
    }
    return result;
  }, [normalized]);
  const selected = normalized.find((opt) => opt.value === value);
  const [open, setOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const [position, setPosition] = useState(null);

  // Click outside / Escape closes.
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (
        !rootRef.current?.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOnViewportChange = (event) => {
      if (!panelRef.current?.contains(event.target)) setOpen(false);
    };
    if (portal) {
      window.addEventListener("scroll", closeOnViewportChange, true);
      window.addEventListener("resize", closeOnViewportChange);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, portal]);

  const toggleOpen = () => {
    if (disabled) return;
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const upwards = spaceBelow < 200 && spaceAbove > spaceBelow;
      setOpenUpwards(upwards);
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16);
      setPosition({
        position: "fixed",
        zIndex: 150,
        width,
        left: Math.max(
          8,
          Math.min(rect.right - width, window.innerWidth - width - 8),
        ),
        ...(upwards
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
        maxHeight: Math.max(48, (upwards ? spaceAbove : spaceBelow) - 12),
        overflowY: "auto",
      });
    }
    setOpen((current) => !current);
  };

  const select = (opt) => {
    if (opt.disabled) return;
    onChange?.(opt.value);
    setOpen(false);
  };

  /**
   * Escape closes this menu and nothing around it. The menus sit inside
   * surfaces that also close on Escape — a node's editor, for one, whose
   * React ancestor is the node React Flow unselects on Escape, portal or not
   * — so while the menu is open the key stops here. The document listener
   * above only covers focus outside the trigger and the menu.
   */
  const closeOnMenuEscape = (event) => {
    if (event.key !== "Escape" || !open) return false;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    return true;
  };

  const handleKeyDown = (event) => {
    if (closeOnMenuEscape(event)) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) {
      toggleOpen();
      return;
    }
    const currentIndex = normalized.findIndex((opt) => opt.value === value);
    const nextIndex = Math.max(
      0,
      Math.min(
        normalized.length - 1,
        currentIndex + (event.key === "ArrowDown" ? 1 : -1),
      ),
    );
    if (normalized[nextIndex]) onChange?.(normalized[nextIndex].value);
  };

  const renderOption = (opt) => {
    const selectedOption = opt.value === value;
    return (
      <button
        key={opt.value}
        type="button"
        role="option"
        aria-selected={selectedOption}
        disabled={opt.disabled}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => select(opt)}
        className={`flex w-full items-center gap-2 rounded-lg ${portal ? "min-h-12 sm:min-h-0" : ""} px-2.5 py-2 text-left text-[11px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          selectedOption
            ? "bg-white/[0.08] text-white"
            : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-100"
        }`}
      >
        {opt.icon && !opt.group ? (
          <span className="shrink-0 flex items-center justify-center">
            {opt.icon}
          </span>
        ) : opt.statusDot ? (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              typeof opt.statusDot === "string" ? opt.statusDot : "bg-[#b2ffd6]"
            }`}
          />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{opt.label}</span>
          {opt.hint ? (
            <span className="block truncate text-[9px] text-neutral-500">
              {opt.hint}
            </span>
          ) : null}
        </span>
        {selectedOption ? (
          <IconCheck size={14} className="shrink-0 text-neutral-100" />
        ) : null}
      </button>
    );
  };

  const menu = open ? (
    <div
      ref={panelRef}
      id={panelId}
      style={portal ? position : undefined}
      role="listbox"
      data-popover-scope={popoverScope ?? undefined}
      aria-label={label}
      onKeyDown={(event) => {
        if (closeOnMenuEscape(event)) triggerRef.current?.focus();
      }}
      className={`${PANEL_CLASS} ui-scroll ${portal ? "" : widthClass} ${
        portal ? "" : openUpwards ? "bottom-full mb-1.5" : "top-full mt-1.5"
      } ${panelClassName}`}
    >
      {sections.map((section) =>
        section.group ? (
          <div key={section.key} role="group" aria-label={section.group.label}>
            <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-3 text-[11px] text-neutral-400">
              {section.group.icon}
              <span>{section.group.label}</span>
            </div>
            {section.options.map(renderOption)}
          </div>
        ) : (
          section.options.map(renderOption)
        ),
      )}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        {...triggerProps}
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        className={`flex h-8 min-w-0 items-center gap-1.5 rounded-xl bg-white/[0.04] px-2.5 text-left text-[11px] text-neutral-300 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-not-allowed disabled:opacity-40 ${triggerClassName}`}
      >
        {selected?.icon ? (
          <span className="shrink-0 flex items-center justify-center">
            {selected.icon}
          </span>
        ) : placeholderIcon ? (
          <span className="shrink-0 flex items-center justify-center">
            {placeholderIcon}
          </span>
        ) : selected?.statusDot ? (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              typeof selected.statusDot === "string"
                ? selected.statusDot
                : "bg-[#b2ffd6]"
            }`}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {selected ? selected.label : (placeholder ?? "")}
        </span>
        <IconChevronDown
          size={12}
          className={`shrink-0 text-neutral-500 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}

FlatSelect.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func,
  /** Array of strings or {value, label, hint?, disabled?, icon?, group?: {id, label, icon?}} objects. */
  options: PropTypes.array,
  label: PropTypes.string,
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
  panelClassName: PropTypes.string,
  disabled: PropTypes.bool,
  widthClass: PropTypes.string,
  placeholder: PropTypes.string,
  placeholderIcon: PropTypes.node,
  portal: PropTypes.bool,
  triggerProps: PropTypes.object,
};
