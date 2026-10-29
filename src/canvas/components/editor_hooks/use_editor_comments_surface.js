import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readCommentSeenAt, unreadCommentCount, unreadCommentIds, writeCommentSeenAt } from "../../comments/comment_notifications.js";
import { countOpen, listOpenComments, normalizeComments, sortedComments } from "../../comments/comment_model.js";
import { loadIdentity } from "../../collab/identity.js";
import { docToScreen, screenToDoc } from "../../editor/rulers_geometry.js";
import { registerCommentEscapeLayer } from "../comment_escape_layers.js";
import { clampSize } from "../comment_view_helpers.jsx";

const PLACE_DRAG_SLOP_PX = 3;
const POPOVER_WIDTH = 264;

/** Own comment placement, seen state and Escape layering for one mounted surface. */
export function useEditorCommentsSurface({ open = false, addMode = false, comments = [],
  zoom = 1, offsetX = 0, offsetY = 0, onClose = null, onToggleAddMode = null,
  onCreate = null, onReply = null, onResolve = null, onDelete = null }) {
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("open");
  const [draft, setDraft] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  // Local "new since last look" state: the document stores messages, the
  // client stores when this device last opened the panel.
  const [seenAt, setSeenAt] = useState(() => readCommentSeenAt());

  const list = useMemo(() => normalizeComments(comments), [comments]);
  const openCount = useMemo(() => countOpen(list), [list]);
  const unreadIds = useMemo(
    () => new Set(unreadCommentIds(list, seenAt)),
    [list, seenAt],
  );
  const unreadCount = useMemo(
    () => unreadCommentCount(list, seenAt),
    [list, seenAt],
  );

  // Opening the panel (or receiving a thread while it is open) marks it seen.
  useEffect(() => {
    if (!open) return;
    const now = Date.now();
    writeCommentSeenAt(now);
    setSeenAt(now);
  }, [open, list]);
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
    return registerCommentEscapeLayer(handler);
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

  return { rootRef, list, openCount, unreadIds, unreadCount, threads, selectedId,
    selected, draft, setDraft, replyBody, setReplyBody, author, cameraX, cameraY,
    filter, setFilter, closeThread, beginDraft, submitDraft, submitReply, handleDelete,
    handleResolve, focusThread, popoverStyle, handleModePointerDown,
    handleModePointerUp, handleModePointerCancel };
}
