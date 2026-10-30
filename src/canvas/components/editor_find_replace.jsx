import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import {
  findTextMatches,
  replaceAll,
  replaceOne,
} from "../editor/find_replace.js";

function labelOr(t, key, fallback, params = null) {
  const value = t(key, params ?? undefined);
  return typeof value === "string" && value && value !== key ? value : fallback;
}

/**
 * Floating find & replace bar.
 *
 * It owns the query, the match cursor and the replace fields; the document comes
 * in as a prop and every commit goes back through `onApplyDoc`, which the editor
 * routes to `engine.setDoc` so a Replace All is exactly one undo entry. The bar
 * is a `data-floating-surface`, which is how the editor shortcut hook knows to
 * leave Delete, ⌘Z and single-key tools to the focused field instead of the
 * canvas.
 */
export default function EditorFindReplace({
  open = false,
  doc = null,
  onClose,
  onFocusMatch,
  onApplyDoc,
}) {
  const { t } = useI18n();
  const queryRef = useRef(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(
    () => findTextMatches(doc, { query, caseSensitive, wholeWord }),
    [doc, query, caseSensitive, wholeWord],
  );

  // A new query starts at the first match again.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, caseSensitive, wholeWord]);

  // Clamp after a replacement shrinks the list.
  useEffect(() => {
    setActiveIndex((current) =>
      matches.length === 0 ? 0 : Math.min(current, matches.length - 1),
    );
  }, [matches.length]);

  // Open focuses and selects the query so ⌘F feels like the browser's find.
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => {
      queryRef.current?.focus();
      queryRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Report the current match to the editor so the owning text node is selected.
  useEffect(() => {
    if (!open || matches.length === 0) return;
    const match = matches[Math.min(activeIndex, matches.length - 1)];
    if (match) onFocusMatch?.(match);
  }, [open, matches, activeIndex, onFocusMatch]);

  const step = useCallback(
    (delta) => {
      if (matches.length === 0) return;
      setActiveIndex((current) => {
        const next = (current + delta + matches.length) % matches.length;
        return next;
      });
    },
    [matches.length],
  );

  const onQueryKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      step(1);
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      step(-1);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.code === "KeyG") {
      event.preventDefault();
      event.stopPropagation();
      step(1);
    }
  };

  const applyOne = () => {
    if (matches.length === 0) return;
    const match = matches[Math.min(activeIndex, matches.length - 1)];
    const result = replaceOne(doc, match, replacement);
    if (result.replaced) onApplyDoc?.(result.doc);
  };

  const applyAll = () => {
    if (matches.length === 0) return;
    const result = replaceAll(
      doc,
      { query, caseSensitive, wholeWord },
      replacement,
    );
    if (result.count > 0 && result.doc !== doc) onApplyDoc?.(result.doc);
  };

  if (!open) return null;

  const hasMatches = matches.length > 0;
  const countLabel = !query
    ? ""
    : hasMatches
      ? labelOr(t, "findReplace.matchCount", `${activeIndex + 1} / ${matches.length}`, {
          current: activeIndex + 1,
          total: matches.length,
        })
      : labelOr(t, "findReplace.noResults", "No results");

  const toggleClass = (active) =>
    `flex min-h-5 items-center rounded-md px-1.5 text-[9px] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
      active
        ? "bg-white/[0.12] text-white"
        : "text-neutral-400 hover:text-neutral-200"
    }`;

  const iconButtonClass =
    "flex size-5 flex-none items-center justify-center rounded-md text-neutral-400 transition-colors outline-none hover:bg-white/[0.08] hover:text-white focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-default disabled:opacity-40";

  return createPortal(
    <div
      data-floating-surface
      data-testid="find-replace-bar"
      role="search"
      aria-label={labelOr(t, "findReplace.title", "Find and replace")}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Every control belongs to this search surface, including its toggles.
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
      }}
      className="fixed left-1/2 top-[52px] z-[125] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-white/10 bg-black/95 p-2 font-mono shadow-panel backdrop-blur"
    >
      <div className="flex items-center gap-1.5">
        <Search
          size={11}
          strokeWidth={1.5}
          aria-hidden="true"
          className="flex-none text-neutral-500"
        />
        <input
          ref={queryRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onQueryKeyDown}
          placeholder={labelOr(t, "findReplace.findPlaceholder", "Find text")}
          aria-label={labelOr(t, "findReplace.findPlaceholder", "Find text")}
          className="min-w-0 flex-1 rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-neutral-100 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        />
        <span
          aria-live="polite"
          className="w-12 flex-none text-right text-[9px] tabular-nums text-neutral-400"
        >
          {countLabel}
        </span>
        <button
          type="button"
          aria-pressed={caseSensitive}
          title={labelOr(t, "findReplace.caseSensitive", "Match case")}
          aria-label={labelOr(t, "findReplace.caseSensitive", "Match case")}
          onClick={() => setCaseSensitive((value) => !value)}
          className={toggleClass(caseSensitive)}
        >
          Aa
        </button>
        <button
          type="button"
          aria-pressed={wholeWord}
          title={labelOr(t, "findReplace.wholeWord", "Whole word")}
          aria-label={labelOr(t, "findReplace.wholeWord", "Whole word")}
          onClick={() => setWholeWord((value) => !value)}
          className={toggleClass(wholeWord)}
        >
          W
        </button>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={!hasMatches}
          aria-label={labelOr(t, "findReplace.previous", "Previous match")}
          className={iconButtonClass}
        >
          <ChevronUp size={11} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!hasMatches}
          aria-label={labelOr(t, "findReplace.next", "Next match")}
          className={iconButtonClass}
        >
          <ChevronDown size={11} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={labelOr(t, "findReplace.close", "Close")}
          className={iconButtonClass}
        >
          <X size={10} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          type="text"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={onQueryKeyDown}
          placeholder={labelOr(
            t,
            "findReplace.replacePlaceholder",
            "Replace with",
          )}
          aria-label={labelOr(
            t,
            "findReplace.replacePlaceholder",
            "Replace with",
          )}
          className="min-w-0 flex-1 rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-neutral-100 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        />
        <button
          type="button"
          onClick={applyOne}
          disabled={!hasMatches}
          className="min-h-5 flex-none rounded-md bg-white/[0.06] px-2 text-[10px] text-neutral-200 transition-colors outline-none hover:bg-white/[0.12] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-default disabled:opacity-40"
        >
          {labelOr(t, "findReplace.replaceOne", "Replace")}
        </button>
        <button
          type="button"
          onClick={applyAll}
          disabled={!hasMatches}
          className="min-h-5 flex-none rounded-md bg-white px-2 text-[10px] font-medium text-black transition-colors outline-none hover:bg-neutral-200 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-default disabled:opacity-40"
        >
          {labelOr(t, "findReplace.replaceAll", "Replace all")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

EditorFindReplace.propTypes = {
  open: PropTypes.bool,
  doc: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onFocusMatch: PropTypes.func,
  onApplyDoc: PropTypes.func,
};
