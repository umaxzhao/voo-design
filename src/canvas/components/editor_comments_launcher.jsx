import { createPortal } from "react-dom";
import { useCommentLauncherHost } from "./comment_launcher_host.jsx";
import PropTypes from "prop-types";
import { Loader2, MessageSquare } from "lucide-react";
import { label } from "./comment_label.js";

export default function EditorCommentsLauncher({ open, onOpen, unreadCount, openCount, t, visible = true, busy = false }) {
  const host = useCommentLauncherHost();
  if (!host || !visible) return null;
  return createPortal(<>
      {!open && onOpen ? (
        <button
          type="button"
          data-testid="editor-comments-toggle"
          onClick={onOpen}
          aria-busy={busy}
          aria-label={label(t, "editor.comments.toggle", "Show/hide comments")}
          title={label(t, "editor.comments.toggle", "Show/hide comments")}
          className="pointer-events-auto relative flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg bg-[#222222] px-2 text-[10px] leading-none text-neutral-300 shadow-pop outline-none transition-opacity hover:opacity-80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        >
          {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <MessageSquare size={12} />}
          {unreadCount > 0 ? (
            <span
              data-testid="editor-comments-unread-count"
              className="rounded-full bg-[#a7ffd4] px-1 text-[9px] leading-none tabular-nums text-black"
            >
              {unreadCount}
            </span>
          ) : openCount > 0 ? (
            <span className="tabular-nums text-[#a7ffd4]">{openCount}</span>
          ) : null}
        </button>
      ) : null}

  </>, host);
}
EditorCommentsLauncher.propTypes = { open: PropTypes.bool, onOpen: PropTypes.func,
  unreadCount: PropTypes.number, openCount: PropTypes.number, t: PropTypes.func, visible: PropTypes.bool, busy: PropTypes.bool };
