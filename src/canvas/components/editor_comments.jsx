/**
 * Canvas comments: pins in document space, a thread popover, and a floating
 * thread list.
 *
 * Geometry follows the ruler overlay exactly — pins are placed with
 * `docToScreen(x, { zoom, pan: offsetX })`, so they stay glued to the artwork
 * while the camera pans/zooms and never introduce a second camera. The root is
 * `pointer-events-none`; only pins, the popover, the panel, and the
 * comment-mode capture layer accept the pointer, so drawing and selection on
 * the canvas are unchanged.
 *
 * Comment mode is a placement tool, not a canvas tool: clicking the canvas
 * opens a draft composer at that document point, and only posting commits the
 * comment (one document edit = one history entry in the parent). The mode stays
 * armed until it is toggled off or Escape unwinds it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  Check,
  MessageSquare,
  MessageSquarePlus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  countOpen,
  listOpenComments,
  normalizeComments,
  sortedComments,
} from "../comments/comment_model.js";
import { loadIdentity, avatarUrl } from "../collab/identity.js";
import {
  docToScreen,
  screenToDoc,
} from "../editor/rulers_geometry.js";

/** Click-vs-drag threshold for comment mode placement. */
const PLACE_DRAG_SLOP_PX = 3;
const POPOVER_WIDTH = 264;

function label(t, key, fallback) {
  const value = typeof t === "function" ? t(key) : key;
  return value && value !== key ? value : fallback;
}

function clampSize(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function authorName(author, t) {
  const name = typeof author?.name === "string" ? author.name.trim() : "";
  return name || label(t, "editor.comments.authorFallback", "You");
}

function authorSeed(author) {
  return (
    (typeof author?.avatarSeed === "string" && author.avatarSeed.trim()) ||
    (typeof author?.id === "string" && author.id.trim()) ||
    (typeof author?.name === "string" && author.name.trim()) ||
    "guest"
  );
}

function initialOf(author, t) {
  const name = authorName(author, t).trim();
  return name ? name.slice(0, 1).toUpperCase() : "?";
}

function formatWhen(value) {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return "";
  }
}

function pointText(body, limit = 60) {
  const text = typeof body === "string" ? body.replace(/\s+/g, " ").trim() : "";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

// ─── Escape layering ────────────────────────────────────────────────────────
// The editor owns a capture-phase Escape handler that unwinds tools and
// selection. A comment popover must consume Escape first. Registering the
// listener at module evaluation (this module is imported eagerly by the editor)
// guarantees it sits before the editor hook, whatever order the overlay mounts
// in. Only a layer that actually handles Escape stops the event, so with no
// comments open the editor's Escape behaviour is untouched.
const escapeLayers = new Set();

function runEscapeLayers() {
  const handlers = [...escapeLayers].reverse();
  for (const handler of handlers) {
    if (handler()) return true;
  }
  return false;
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (!runEscapeLayers()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
}

/** Avatar with a rendered initial underneath, so a blocked network still reads. */
function CommentAvatar({ author, size = 20, t = null }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-[9px] leading-none text-neutral-300"
      style={{ width: size, height: size }}
    >
      {initialOf(author, t)}
      <img
        src={avatarUrl(authorSeed(author))}
        alt=""
        draggable={false}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}

function PostButton({ disabled, label: text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-lg bg-[#a7ffd4] px-2 py-1 text-[10px] leading-none text-black outline-none transition-opacity hover:opacity-80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-30 disabled:hover:opacity-30"
    >
      <Send size={11} />
      {text}
    </button>
  );
}

export default function EditorComments({
  open = false,
  addMode = false,
  comments = [],
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
  onOpen = null,
  onClose = null,
  onToggleAddMode = null,
  onCreate = null,
  onReply = null,
  onResolve = null,
  onDelete = null,
  t = null,
}) {
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("open");
  const [draft, setDraft] = useState(null);
  const [replyBody, setReplyBody] = useState("");

  const list = useMemo(() => normalizeComments(comments), [comments]);
  const openCount = useMemo(() => countOpen(list), [list]);
  const threads = useMemo(
    () => (filter === "open" ? listOpenComments(list) : sortedComments(list)),
    [filter, list],
  );
  const selected = useMemo(
    () => list.find((comment) => comment.id === selectedId) ?? null,
    [list, selectedId],
  );

  const author = useMemo(() => {
    try {
      const identity = loadIdentity();
      return {
        id: identity.userId,
        name: identity.name,
        avatarSeed: identity.avatarSeed,
      };
    } catch {
      return { id: "", name: "", avatarSeed: "guest" };
    }
  }, []);

  const cameraX = useMemo(
    () => ({ zoom: zoom || 1, pan: Number(offsetX) || 0 }),
    [zoom, offsetX],
  );
  const cameraY = useMemo(
    () => ({ zoom: zoom || 1, pan: Number(offsetY) || 0 }),
    [zoom, offsetY],
  );
  // The overlay is stretched over the stage, so it must observe resizes to
  // clamp the popover inside the visible canvas.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;
    const measure = () =>
      setSize({
        width: clampSize(element.clientWidth),
        height: clampSize(element.clientHeight),
      });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pointOf = useCallback((event) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
    };
  }, []);

  const docPointOf = useCallback(
    (point) => ({
      x: screenToDoc(point.x, cameraX),
      y: screenToDoc(point.y, cameraY),
    }),
    [cameraX, cameraY],
  );

  const closeThread = useCallback(() => {
    setSelectedId(null);
    setReplyBody("");
  }, []);

  const beginDraft = useCallback((docPoint) => {
    setSelectedId(null);
    setReplyBody("");
    setDraft({ x: docPoint.x, y: docPoint.y, body: "" });
  }, []);

  // Escape consumes one layer at a time: draft → thread → comment mode → panel.
  // The ref keeps the module-level listener stable across renders.
  const escapeStateRef = useRef({});
  escapeStateRef.current = {
    draft,
    selectedId,
    addMode,
    open,
    closeThread,
    onToggleAddMode,
    onClose,
  };
  useEffect(() => {
    const handler = () => {
      const state = escapeStateRef.current;
      if (state.draft) {
        setDraft(null);
        return true;
      }
      if (state.selectedId) {
        state.closeThread();
        return true;
      }
      if (state.addMode) {
        state.onToggleAddMode?.();
        return true;
      }
      if (state.open) {
        state.onClose?.();
        return true;
      }
      return false;
    };
    escapeLayers.add(handler);
    return () => {
      escapeLayers.delete(handler);
    };
  }, []);

  // Closing the panel also dismisses its popover; a pin can still open one
  // while the panel stays closed.
  useEffect(() => {
    if (open) return;
    closeThread();
    setDraft(null);
  }, [open, closeThread]);

  // A click anywhere outside a comment surface dismisses the transient UI but
  // must not swallow the event: the canvas still receives it.
  const transientOpen = Boolean(selectedId) || Boolean(draft);
  useEffect(() => {
    if (!transientOpen) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (
        target?.closest?.(
          "[data-comment-surface], [data-comment-pin], [data-comment-mode-overlay]",
        )
      ) {
        return;
      }
      closeThread();
      setDraft(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [transientOpen, closeThread]);

  const handleModePointerDown = useCallback(
    (event) => {
      if (event.button !== 0) return;
      const point = pointOf(event);
      gestureRef.current = {
        pointerId: event.pointerId,
        start: point,
        docPoint: docPointOf(point),
      };
    },
    [docPointOf, pointOf],
  );

  const handleModePointerUp = useCallback(
    (event) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const point = pointOf(event);
      const moved = Math.hypot(
        point.x - gesture.start.x,
        point.y - gesture.start.y,
      );
      if (moved > PLACE_DRAG_SLOP_PX) return;
      beginDraft(gesture.docPoint);
    },
    [beginDraft, pointOf],
  );

  const handleModePointerCancel = useCallback(() => {
    gestureRef.current = null;
  }, []);

  const submitDraft = useCallback(() => {
    if (!draft) return;
    const body = draft.body.trim();
    if (!body) return;
    onCreate?.(draft.x, draft.y, body, author);
    setDraft(null);
  }, [author, draft, onCreate]);

  const submitReply = useCallback(() => {
    if (!selected) return;
    const body = replyBody.trim();
    if (!body) return;
    onReply?.(selected.id, body, author);
    setReplyBody("");
  }, [author, onReply, replyBody, selected]);

  const handleDelete = useCallback(
    (id) => {
      onDelete?.(id);
      if (selectedId === id) closeThread();
    },
    [closeThread, onDelete, selectedId],
  );

  const handleResolve = useCallback(
    (comment) => {
      onResolve?.(comment.id, !comment.resolved);
    },
    [onResolve],
  );

  const focusThread = useCallback((comment) => {
    setDraft(null);
    setReplyBody("");
    setSelectedId(comment.id);
  }, []);

  /**
   * Popover position: to the right of the pin, flipped/clamped so it stays in
   * the stage. The stage size is measured, so a narrow editor still shows the
   * whole surface.
   */
  const popoverStyle = useCallback(
    (docX, docY, height) => {
      const x = docToScreen(docX, cameraX);
      const y = docToScreen(docY, cameraY);
      const stageWidth = size.width || 0;
      const stageHeight = size.height || 0;
      const maxLeft = Math.max(8, stageWidth - POPOVER_WIDTH - 8);
      const left = Math.min(Math.max(8, x + 16), maxLeft);
      const maxTop = Math.max(8, stageHeight - (height || 200) - 8);
      const top = Math.min(Math.max(8, y - 24), maxTop);
      return {
        left,
        top,
        width: POPOVER_WIDTH,
        maxHeight: Math.max(160, (stageHeight || 420) - 16),
      };
    },
    [cameraX, cameraY, size.height, size.width],
  );

  return (
    <div
      ref={rootRef}
      data-testid="editor-comments"
      className="pointer-events-none absolute inset-0 z-20 select-none font-mono"
    >
      {addMode ? (
        <div
          data-testid="editor-comment-mode-overlay"
          data-comment-mode-overlay="true"
          role="presentation"
          className="pointer-events-auto absolute inset-0 z-10 cursor-crosshair"
          onPointerDown={handleModePointerDown}
          onPointerUp={handleModePointerUp}
          onPointerCancel={handleModePointerCancel}
        />
      ) : null}

      {addMode ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#222222] px-3 py-1.5 text-[10px] leading-none text-neutral-200 shadow-pop">
          <span className="size-1.5 rounded-full bg-[#a7ffd4]" />
          {label(
            t,
            "editor.comments.modeHint",
            "Click the canvas to comment, Esc to exit",
          )}
        </div>
      ) : null}

      {list.map((comment, index) => {
        const x = docToScreen(comment.x, cameraX);
        const y = docToScreen(comment.y, cameraY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const active = comment.id === selectedId;
        const summary =
          pointText(comment.messages[0]?.body, 48) ||
          label(t, "editor.comments.emptyThread", "No messages yet");
        return (
          <button
            key={comment.id}
            type="button"
            data-testid="editor-comment-pin"
            data-comment-id={comment.id}
            data-comment-pin="true"
            aria-label={`${label(t, "editor.comments.pin", "Comment")} ${
              index + 1
            }: ${summary}`}
            aria-pressed={active}
            onClick={() => focusThread(comment)}
            className={`pointer-events-auto absolute z-20 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] leading-none shadow-pop outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white/70 ${
              comment.resolved
                ? "bg-neutral-700 text-neutral-300"
                : "bg-[#a7ffd4] text-black"
            } ${active ? "ring-2 ring-white/70" : ""}`}
            style={{ left: x, top: y }}
          >
            {comment.resolved ? (
              <Check size={10} />
            ) : (
              <span className="tabular-nums">{comment.messages.length}</span>
            )}
          </button>
        );
      })}

      {draft ? (
        <div
          role="dialog"
          aria-label={label(t, "editor.comments.add", "Add comment")}
          data-testid="editor-comment-composer"
          data-comment-surface="true"
          className="pointer-events-auto absolute z-40 rounded-2xl bg-[#1e1e1e] p-3 shadow-panel"
          style={popoverStyle(draft.x, draft.y, 190)}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] leading-none text-neutral-300">
              {label(t, "editor.comments.add", "Add comment")}
            </span>
            <button
              type="button"
              onClick={() => setDraft(null)}
              aria-label={label(t, "editor.comments.cancel", "Cancel")}
              className="flex size-6 items-center justify-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
            >
              <X size={12} />
            </button>
          </div>
          <textarea
            autoFocus
            rows={3}
            value={draft.body}
            aria-label={label(t, "editor.comments.placeholder", "Add a comment…")}
            placeholder={label(
              t,
              "editor.comments.placeholder",
              "Add a comment…",
            )}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, body: event.target.value } : current,
              )
            }
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submitDraft();
              }
            }}
            className="w-full resize-none rounded-xl bg-[#222222] px-2 py-1.5 text-[11px] leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-[9px] text-neutral-500">
              {authorName(author, t)}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg px-2 py-1 text-[10px] leading-none text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
              >
                {label(t, "editor.comments.cancel", "Cancel")}
              </button>
              <PostButton
                disabled={!draft.body.trim()}
                label={label(t, "editor.comments.post", "Post")}
                onClick={submitDraft}
              />
            </div>
          </div>
        </div>
      ) : null}

      {selected && !draft ? (
        <div
          role="dialog"
          aria-label={label(t, "editor.comments.thread", "Comment thread")}
          data-testid="editor-comment-thread"
          data-comment-surface="true"
          className="pointer-events-auto absolute z-40 flex flex-col overflow-hidden rounded-2xl bg-[#1e1e1e] shadow-panel"
          style={popoverStyle(selected.x, selected.y, 340)}
        >
          <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <CommentAvatar author={selected.author} size={22} t={t} />
              <div className="min-w-0">
                <div className="truncate text-[10px] leading-tight text-neutral-200">
                  {authorName(selected.author, t)}
                </div>
                <div className="mt-0.5 text-[9px] leading-none text-neutral-500">
                  {selected.resolved
                    ? label(t, "editor.comments.resolved", "Resolved")
                    : formatWhen(selected.createdAt)}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={closeThread}
              aria-label={label(t, "editor.comments.close", "Close comments")}
              className="flex size-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
            >
              <X size={12} />
            </button>
          </div>

          <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-2">
            {selected.messages.length === 0 ? (
              <li className="text-[10px] text-neutral-500">
                {label(t, "editor.comments.emptyThread", "No messages yet")}
              </li>
            ) : (
              selected.messages.map((message) => (
                <li key={message.id} className="flex gap-2">
                  <CommentAvatar author={message.author} size={18} t={t} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[10px] leading-tight text-neutral-300">
                        {authorName(message.author, t)}
                      </span>
                      <span className="shrink-0 text-[9px] leading-none text-neutral-500">
                        {formatWhen(message.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-neutral-200">
                      {message.body}
                    </p>
                  </div>
                </li>
              ))
            )}
          </ol>

          <div className="px-3 pb-3 pt-1">
            <textarea
              rows={2}
              value={replyBody}
              aria-label={label(t, "editor.comments.reply", "Reply")}
              placeholder={label(
                t,
                "editor.comments.replyPlaceholder",
                "Reply…",
              )}
              onChange={(event) => setReplyBody(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submitReply();
                }
              }}
              className="w-full resize-none rounded-xl bg-[#222222] px-2 py-1.5 text-[11px] leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
            />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => handleResolve(selected)}
                  className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] leading-none text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
                >
                  {selected.resolved ? (
                    <RotateCcw size={11} />
                  ) : (
                    <Check size={11} />
                  )}
                  {selected.resolved
                    ? label(t, "editor.comments.reopen", "Reopen")
                    : label(t, "editor.comments.resolve", "Resolve")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(selected.id)}
                  aria-label={label(t, "editor.comments.delete", "Delete comment")}
                  className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] leading-none text-rose-400 outline-none hover:bg-rose-500/10 hover:text-rose-300 focus-visible:ring-1 focus-visible:ring-rose-500/40"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <PostButton
                disabled={!replyBody.trim()}
                label={label(t, "editor.comments.reply", "Reply")}
                onClick={submitReply}
              />
            </div>
          </div>
        </div>
      ) : null}

      {!open && onOpen ? (
        <button
          type="button"
          data-testid="editor-comments-toggle"
          onClick={onOpen}
          aria-label={label(t, "editor.comments.toggle", "Show/hide comments")}
          title={label(t, "editor.comments.toggle", "Show/hide comments")}
          className="pointer-events-auto absolute bottom-3 left-3 z-30 flex h-7 items-center gap-1.5 rounded-lg bg-[#222222] px-2 text-[10px] leading-none text-neutral-300 shadow-pop outline-none transition-opacity hover:opacity-80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        >
          <MessageSquare size={12} />
          {openCount > 0 ? (
            <span className="tabular-nums text-[#a7ffd4]">{openCount}</span>
          ) : null}
        </button>
      ) : null}

      {open ? (
        <aside
          aria-label={label(t, "editor.comments.title", "Comments")}
          data-testid="editor-comments-panel"
          data-comment-surface="true"
          className="pointer-events-auto absolute right-4 top-4 z-40 flex w-72 flex-col overflow-hidden rounded-2xl bg-[#1c1c1c] shadow-panel"
          style={{ maxHeight: "calc(100% - 2rem)" }}
        >
          <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquare size={13} className="shrink-0 text-[#a7ffd4]" />
              <h2 className="truncate text-[11px] font-medium leading-none text-neutral-200">
                {label(t, "editor.comments.title", "Comments")}
              </h2>
              <span className="shrink-0 rounded-md bg-neutral-800 px-1.5 py-0.5 text-[9px] leading-none tabular-nums text-neutral-400">
                {openCount}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                data-testid="editor-comments-add-mode"
                onClick={onToggleAddMode}
                aria-pressed={Boolean(addMode)}
                aria-label={label(t, "editor.comments.addMode", "Comment mode")}
                title={label(t, "editor.comments.addMode", "Comment mode")}
                className={`flex size-7 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                  addMode
                    ? "bg-[#a7ffd4] text-black"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                }`}
              >
                <MessageSquarePlus size={13} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={label(t, "editor.comments.close", "Close comments")}
                className="flex size-7 items-center justify-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 px-3 pb-2">
            {[
              {
                id: "open",
                text: label(t, "editor.comments.openFilter", "Open"),
                count: openCount,
              },
              {
                id: "all",
                text: label(t, "editor.comments.allFilter", "All"),
                count: list.length,
              },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] leading-none outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                  filter === option.id
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {option.text}
                <span className="tabular-nums opacity-70">{option.count}</span>
              </button>
            ))}
          </div>

          <ul
            data-testid="editor-comments-list"
            className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
          >
            {threads.length === 0 ? (
              <li className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                <MessageSquare size={18} className="text-neutral-500" />
                <span className="text-[10px] leading-relaxed text-neutral-500">
                  {filter === "open"
                    ? label(t, "editor.comments.emptyOpen", "No open comments")
                    : label(t, "editor.comments.empty", "No comments yet")}
                </span>
              </li>
            ) : (
              threads.map((comment) => {
                const first = comment.messages[0];
                const active = comment.id === selectedId;
                const count = comment.messages.length;
                return (
                  <li key={comment.id} className="mt-0.5">
                    <button
                      type="button"
                      onClick={() => focusThread(comment)}
                      data-comment-id={comment.id}
                      aria-label={`${label(
                        t,
                        "editor.comments.thread",
                        "Comment thread",
                      )}: ${pointText(first?.body, 48)}`}
                      className={`flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-neutral-800/60 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                        active ? "bg-neutral-800" : ""
                      }`}
                    >
                      <CommentAvatar author={comment.author} size={20} t={t} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={`truncate text-[10px] leading-tight ${
                              comment.resolved
                                ? "text-neutral-500"
                                : "text-neutral-300"
                            }`}
                          >
                            {authorName(comment.author, t)}
                          </span>
                          <span className="shrink-0 text-[9px] leading-none text-neutral-500">
                            {formatWhen(comment.createdAt)}
                          </span>
                        </span>
                        <span
                          className={`mt-0.5 block truncate text-[11px] leading-snug ${
                            comment.resolved
                              ? "text-neutral-500"
                              : "text-neutral-200"
                          }`}
                        >
                          {pointText(first?.body) ||
                            label(
                              t,
                              "editor.comments.emptyThread",
                              "No messages yet",
                            )}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-[9px] leading-none text-neutral-500">
                          {comment.resolved ? (
                            <span className="flex items-center gap-1">
                              <Check size={9} />
                              {label(t, "editor.comments.resolved", "Resolved")}
                            </span>
                          ) : null}
                          {count > 1 ? (
                            <span>
                              {count} {label(t, "editor.comments.messages", "messages")}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex items-center justify-between gap-2 px-3 pb-2 text-[9px] leading-none text-neutral-500">
            <span>{label(t, "editor.comments.panelShortcut", "⌥⌘M")}</span>
            <span>Esc</span>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

EditorComments.propTypes = {
  open: PropTypes.bool,
  addMode: PropTypes.bool,
  comments: PropTypes.array,
  zoom: PropTypes.number,
  offsetX: PropTypes.number,
  offsetY: PropTypes.number,
  onOpen: PropTypes.func,
  onClose: PropTypes.func,
  onToggleAddMode: PropTypes.func,
  onCreate: PropTypes.func,
  onReply: PropTypes.func,
  onResolve: PropTypes.func,
  onDelete: PropTypes.func,
  t: PropTypes.func,
};
