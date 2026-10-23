import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import {
  MAX_RECENT_COMMANDS,
  COMMAND_LABEL_KEYS,
  buildCommandIndex,
  filterCommands,
  moveSelection,
  normalizeRecent,
  pushRecent,
  resolveRecent,
} from "../commands/command_registry.js";

const RECENT_STORAGE_KEY = "voo.commandPalette.recent";
const EMPTY_ACTIONS = [];

function labelOr(t, key, fallback) {
  const value = t(key);
  return typeof value === "string" && value && value !== key ? value : fallback;
}

function readRecent() {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    return raw ? normalizeRecent(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // A blocked storage quota only costs the recent list, never the palette.
  }
}

/**
 * ⌘K command palette.
 *
 * A single searchable surface over the editor's command table, the shortcut
 * catalog and the host's explicit view actions. Rows run through `onRun`, which
 * owns execution and closing; the palette only owns query, selection, recents
 * and focus. It is a portal modal, so it renders above the canvas, panels and
 * every overlay that does not explicitly outrank it (z-130).
 */
export default function EditorCommandPalette({
  open = false,
  actions = EMPTY_ACTIONS,
  onRun,
  onClose,
}) {
  const { t, locale } = useI18n();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState(readRecent);

  // t is stable even when dictionaries finish loading. Track the labels as
  // well as locale so those updates refresh the index without rebuilding on hover.
  const labels = JSON.stringify([
    ...Object.values(COMMAND_LABEL_KEYS),
    ...actions.map((action) => action?.labelKey).filter(Boolean),
  ].map((key) => t(key)));
  const index = useMemo(
    () => buildCommandIndex({ t, actions }),
    [t, locale, labels, actions],
  );
  const filtered = useMemo(() => filterCommands(index, query), [index, query]);
  const recentCommands = useMemo(
    () => resolveRecent(index, recentIds),
    [index, recentIds],
  );

  const showRecent =
    query.trim().length === 0 && recentCommands.length > 0;

  const sections = useMemo(() => {
    if (query.trim()) {
      return [{
        id: "results",
        title: labelOr(t, "commandPalette.sections.results", "Results"),
        commands: filtered,
      }];
    }
    const commands = filtered.filter((command) => command.kind === "command");
    const actionRows = filtered.filter((command) => command.kind === "action");
    const result = [];
    if (showRecent) {
      result.push({
        id: "recent",
        title: labelOr(t, "commandPalette.sections.recent", "Recent"),
        commands: recentCommands,
      });
    }
    if (commands.length > 0) {
      result.push({
        id: "commands",
        title: labelOr(t, "commandPalette.sections.commands", "Commands"),
        commands,
      });
    }
    if (actionRows.length > 0) {
      result.push({
        id: "actions",
        title: labelOr(t, "commandPalette.sections.actions", "Actions"),
        commands: actionRows,
      });
    }
    return result;
  }, [filtered, query, recentCommands, showRecent, t]);

  const flat = useMemo(
    () => sections.flatMap((section) => section.commands),
    [sections],
  );
  const flatIndexById = useMemo(() => {
    const map = new Map();
    flat.forEach((command, indexOfCommand) => map.set(command.id, indexOfCommand));
    return map;
  }, [flat]);

  // Fresh mount/open starts from an empty query and the first row.
  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Clamp the cursor when filtering shrinks the list under it.
  useEffect(() => {
    setActiveIndex((current) =>
      flat.length === 0 ? 0 : Math.min(current, flat.length - 1),
    );
  }, [flat.length]);

  // Keep the active row visible while arrowing through a long result list.
  useEffect(() => {
    const row = listRef.current?.querySelector(
      `[data-command-index="${activeIndex}"]`,
    );
    row?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const runCommand = useCallback(
    (command) => {
      if (!command) return;
      setRecentIds((current) => {
        const next = pushRecent(command.id, current, MAX_RECENT_COMMANDS);
        writeRecent(next);
        return next;
      });
      onRun?.(command);
    },
    [onRun],
  );

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex((current) => moveSelection(current, 1, flat.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex((current) => moveSelection(current, -1, flat.length));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, flat.length - 1));
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      runCommand(flat[activeIndex]);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labelOr(t, "commandPalette.title", "Command palette")}
        data-testid="command-palette"
        className="w-[min(600px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-white/10 bg-black/95 font-mono shadow-panel backdrop-blur"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
          <Search
            size={12}
            strokeWidth={1.5}
            aria-hidden="true"
            className="flex-none text-neutral-500"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={
              flat.length > 0
                ? `command-palette-option-${activeIndex}`
                : undefined
            }
            aria-autocomplete="list"
            aria-label={labelOr(
              t,
              "commandPalette.placeholder",
              "Search commands and actions",
            )}
            placeholder={labelOr(
              t,
              "commandPalette.placeholder",
              "Search commands and actions",
            )}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-neutral-100 outline-none placeholder:text-neutral-400"
          />
          <span className="flex-none text-[9px] text-neutral-500">
            {labelOr(t, "commandPalette.shortcut", "⌘K")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={labelOr(t, "commandPalette.hint.close", "Close")}
            className="flex size-5 flex-none items-center justify-center rounded-md text-neutral-400 transition-colors outline-none hover:bg-white/[0.08] hover:text-white focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          >
            <X size={10} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label={labelOr(t, "commandPalette.title", "Command palette")}
          className="ui-scroll max-h-[min(52vh,420px)] overflow-y-auto py-1"
        >
          {flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-[10px] text-neutral-400">
              {labelOr(t, "commandPalette.empty", "No matching commands")}
            </p>
          ) : (
            sections.map((section) => (
              <section key={section.id} className="px-2">
                <p className="px-1.5 pb-1 pt-2 text-[9px] tracking-[0.08em] text-neutral-500 uppercase">
                  {section.title}
                </p>
                <ul role="group" aria-label={section.title}>
                  {section.commands.map((command) => {
                    const rowIndex = flatIndexById.get(command.id) ?? 0;
                    const active = rowIndex === activeIndex;
                    return (
                      <li
                        key={command.id}
                        id={`command-palette-option-${rowIndex}`}
                        role="option"
                        aria-selected={active}
                        data-command-index={rowIndex}
                        title={command.description || undefined}
                        onPointerMove={() => setActiveIndex(rowIndex)}
                        onClick={() => runCommand(command)}
                        className={`flex cursor-default list-none items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[11px] ${
                          active
                            ? "bg-white/[0.08] text-white"
                            : "text-neutral-300"
                        }`}
                      >
                        <span className="truncate">{command.label}</span>
                        {command.shortcut ? (
                          <kbd className="text-[9px] text-neutral-400">
                            {command.shortcut}
                          </kbd>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[9px] text-neutral-500">
          <span>
            {labelOr(t, "commandPalette.hint.navigate", "↑↓ navigate")}
            {"   "}
            {labelOr(t, "commandPalette.hint.run", "↵ run")}
          </span>
          <span>{labelOr(t, "commandPalette.hint.close", "esc close")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

EditorCommandPalette.propTypes = {
  open: PropTypes.bool,
  actions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string,
      labelKey: PropTypes.string,
      description: PropTypes.string,
      shortcut: PropTypes.string,
      catalogKey: PropTypes.string,
      keywords: PropTypes.arrayOf(PropTypes.string),
      run: PropTypes.func.isRequired,
    }),
  ),
  onRun: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
