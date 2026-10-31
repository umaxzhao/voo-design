import PropertiesPanelShell from "./editor_properties/properties_panel_shell.jsx";
import PropTypes from "prop-types";
import { Check, MessageSquare, MessageSquarePlus, X } from "lucide-react";
import { label, authorName, formatWhen, pointText, CommentAvatar } from "./comment_view_helpers.jsx";
import { commentViewModelType } from "./comment_view_types.js";

export default function EditorCommentsPanel({ model, t, open, addMode, onClose, onToggleAddMode, swapSide = false }) {
  const { openCount, list, filter, setFilter, threads, selectedId, focusThread, unreadIds } = model;
  return <>
      {open ? (
        <PropertiesPanelShell swapSide={swapSide} testId="editor-properties-panel" showHeader={false} ariaLabel={label(t, "editor.comments.title", "Comments")}>
          <section
            data-testid="editor-comments-panel"
            data-comment-surface="true"
            className="pointer-events-auto flex min-h-0 flex-col"
          >
            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
              <div className="flex min-w-0 items-center gap-2">
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
                            {unreadIds.has(comment.id) ? (
                              <span className="rounded-full bg-[#a7ffd4] px-1 text-[9px] leading-none text-black">
                                {label(t, "editor.comments.new", "New")}
                              </span>
                            ) : null}
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
          </section>
        </PropertiesPanelShell>
      ) : null}
  </>;
}
EditorCommentsPanel.propTypes = { model: commentViewModelType.isRequired, t: PropTypes.func, open: PropTypes.bool, addMode: PropTypes.bool, onClose: PropTypes.func, onToggleAddMode: PropTypes.func, swapSide: PropTypes.bool };
