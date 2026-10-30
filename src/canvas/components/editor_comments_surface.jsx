import { useEditorCommentsSurface } from "./editor_hooks/use_editor_comments_surface.js";
import { commentSurfaceProps } from "./comment_view_types.js";
import { label } from "./comment_view_helpers.jsx";
import EditorCommentPins from "./editor_comment_pins.jsx";
import EditorCommentDraft from "./editor_comment_draft.jsx";
import EditorCommentThread from "./editor_comment_thread.jsx";
import EditorCommentsPanel from "./editor_comments_panel.jsx";
import EditorCommentsLauncher from "./editor_comments_launcher.jsx";

export default function EditorCommentsSurface(props) {
  const { open = false, addMode = false, onOpen, onClose, onToggleAddMode, t } = props;
  const model = useEditorCommentsSurface(props);
  const { rootRef, handleModePointerDown, handleModePointerUp, handleModePointerCancel } = model;
  // Do not isolate this root: each child owns its position relative to the
  // canvas aids, inspector and other floating editor surfaces.
  return (
    <div
      ref={rootRef}
      data-testid="editor-comments"
      className="pointer-events-none absolute inset-0 select-none font-mono"
    >
      {addMode ? (
        <div
          data-testid="editor-comment-mode-overlay"
          data-comment-mode-overlay="true"
          role="presentation"
          className="pointer-events-auto absolute inset-0 z-20 cursor-crosshair"
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

      <EditorCommentPins model={model} t={t} />
      <EditorCommentDraft model={model} t={t} />
      <EditorCommentThread model={model} t={t} />
      <EditorCommentsLauncher open={open} onOpen={onOpen} unreadCount={model.unreadCount} openCount={model.openCount} t={t} />
      <EditorCommentsPanel model={model} t={t} open={open} addMode={addMode} onClose={onClose} onToggleAddMode={onToggleAddMode} />
    </div>
  );
}
EditorCommentsSurface.propTypes = commentSurfaceProps;
