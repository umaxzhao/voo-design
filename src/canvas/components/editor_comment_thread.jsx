import PropTypes from "prop-types";
import { Check, RotateCcw, Trash2, X } from "lucide-react";
import { label, authorName, formatWhen, CommentAvatar, PostButton } from "./comment_view_helpers.jsx";
import { commentViewModelType } from "./comment_view_types.js";

export default function EditorCommentThread({ model, t }) {
  const { selected, draft, popoverStyle, closeThread, replyBody, setReplyBody, submitReply, handleResolve, handleDelete } = model;
  return <>
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
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
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
                  <Trash2 className="text-neutral-400" size={11} />
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

  </>;
}
EditorCommentThread.propTypes = { model: commentViewModelType.isRequired, t: PropTypes.func };
