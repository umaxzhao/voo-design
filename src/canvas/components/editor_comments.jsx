import "./editor_comments_layout.css";
import PropertiesPanelShell from "./editor_properties/properties_panel_shell.jsx";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { Loader2, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { countOpen, normalizeComments } from "../comments/comment_model.js";
import { readCommentSeenAt, unreadCommentCount } from "../comments/comment_notifications.js";
import { registerCommentEscapeLayer } from "./comment_escape_layers.js";
import { commentSurfaceProps } from "./comment_view_types.js";
import { useDeferredComments } from "./editor_hooks/use_deferred_comments.js";
import EditorCommentsLauncher from "./editor_comments_launcher.jsx";

function ReadySurface({ readyRef, children }) {
  useLayoutEffect(() => {
    readyRef.current = true;
    return () => { readyRef.current = false; };
  }, [readyRef]);
  return children;
}
ReadySurface.propTypes = { readyRef: PropTypes.shape({ current: PropTypes.bool }).isRequired,
  children: PropTypes.node.isRequired };

/** Keep the existing launcher usable while a cold comments module is loading. */
function PendingComments({ open, addMode, onOpen, onClose, onToggleAddMode, list, t, failed, onRetry, launcherVisible = true, swapSide = false }) {
  // Only an open list owns the inspector. Standalone placement keeps its controls.
  const status = (
    <div role={failed ? "alert" : "status"} aria-busy={!failed} data-testid={failed ? "editor-comments-error" : "editor-comments-loading"}
      className="pointer-events-auto flex items-center gap-2 p-3 text-neutral-300">
      {failed ? null : <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
      <span className="text-[11px]">{t(failed ? "editor.comments.loadFailed" : "common.loading")}</span>
      {failed ? <button type="button" onClick={onRetry}
        className="rounded-lg px-2 py-1 text-[11px] outline-none hover:bg-neutral-800 focus-visible:ring-1 focus-visible:ring-white/40">
        {t("error.retry")}
      </button> : null}
      <button type="button" onClick={open ? onClose : onToggleAddMode}
        aria-label={t("editor.comments.close")}
        className="flex size-7 items-center justify-center rounded-lg outline-none hover:bg-neutral-800 focus-visible:ring-1 focus-visible:ring-white/40">
        <X size={13} />
      </button>
    </div>
  );
  return (
    <div data-testid="editor-comments" aria-busy={(open || addMode) && !failed} className="pointer-events-none absolute inset-0 select-none font-mono">
      {addMode ? <div className="pointer-events-auto absolute inset-0 z-20 cursor-wait" /> : null}
      <EditorCommentsLauncher busy={addMode && !open && !failed} open={open} onOpen={onOpen} visible={launcherVisible} openCount={countOpen(list)}
        unreadCount={unreadCommentCount(list, readCommentSeenAt())} t={t} />
      {open ? (
        <PropertiesPanelShell swapSide={swapSide} testId="editor-properties-panel" showHeader={false} ariaLabel={t("editor.comments.title")}>
          {status}
        </PropertiesPanelShell>
      ) : addMode && failed ? (
        <div className="pointer-events-auto absolute bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-neutral-900 shadow-pop">{status}</div>
      ) : addMode ? <span role="status" className="sr-only">{t("common.loading")}</span> : null}
    </div>
  );
}
PendingComments.propTypes = { ...commentSurfaceProps, list: PropTypes.array.isRequired, failed: PropTypes.bool, onRetry: PropTypes.func };

/** Empty, closed canvases download only the launcher; retain state after first use. */
export default function EditorComments(props) {
  const { open = false, addMode = false, comments = [] } = props;
  const { t: translate } = useI18n();
  const t = props.t ?? translate;
  const list = useMemo(() => normalizeComments(comments), [comments]);
  const activated = useRef(false);
  const ready = useRef(false);
  if (open || addMode || list.length) activated.current = true;
  const { Component: CommentsSurface, error, retry } = useDeferredComments(activated.current);
  const latest = useRef(props);
  latest.current = props;
  // The shared listener is imported eagerly, preserving priority over canvas
  // Escape even before the lazily loaded surface has registered its own layer.
  useEffect(() => registerCommentEscapeLayer(() => {
    if (ready.current) return false;
    const current = latest.current;
    if (current.addMode) { current.onToggleAddMode?.(); return true; }
    if (current.open) { current.onClose?.(); return true; }
    return false;
  }), []);
  const fallback = <PendingComments {...props} t={t} list={list} failed={Boolean(error)} onRetry={retry} />;
  if (!activated.current || !CommentsSurface) return fallback;
  return (
    <ReadySurface readyRef={ready}><CommentsSurface {...props} t={t} /></ReadySurface>
  );
}
EditorComments.propTypes = commentSurfaceProps;
