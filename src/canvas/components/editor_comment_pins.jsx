import PropTypes from "prop-types";
import { Check } from "lucide-react";
import { label, pointText } from "./comment_view_helpers.jsx";
import { commentViewModelType } from "./comment_view_types.js";
import { docToScreen } from "../editor/rulers_geometry.js";

export default function EditorCommentPins({ model, t }) {
  const { list, cameraX, cameraY, selectedId, focusThread, unreadIds } = model;
  return <>
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
            {unreadIds.has(comment.id) ? (
              <span
                aria-hidden="true"
                data-testid="editor-comment-pin-new"
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#E5B2FF] ring-1 ring-black/40"
              />
            ) : null}
          </button>
        );
      })}

  </>;
}
EditorCommentPins.propTypes = { model: commentViewModelType.isRequired, t: PropTypes.func };
