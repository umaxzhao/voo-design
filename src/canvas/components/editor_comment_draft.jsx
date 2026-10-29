import PropTypes from "prop-types";
import { X } from "lucide-react";
import { label, authorName, PostButton } from "./comment_view_helpers.jsx";
import { commentViewModelType } from "./comment_view_types.js";

export default function EditorCommentDraft({ model, t }) {
  const { draft, setDraft, popoverStyle, author, submitDraft } = model;
  return <>
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
              className="flex size-7 items-center justify-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
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

  </>;
}
EditorCommentDraft.propTypes = { model: commentViewModelType.isRequired, t: PropTypes.func };
