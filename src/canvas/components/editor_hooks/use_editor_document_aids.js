import { useCallback, useEffect, useRef, useState } from "react";
import { getSetting, setSetting } from "../../../shared/settings.js";
import { useShowRulers } from "../../use_show_rulers.js";
import { addGuide, createGuide, readDocumentGuides, removeGuide, serialiseGuides, updateGuide } from "../../editor/rulers_geometry.js";
import { addComment, addReply, deleteComment, normalizeComments, serializeComments, setResolved } from "../../comments/comment_model.js";

const SHOW_GUIDES_SETTING = "voo.editor.showGuides";
const GUIDES_HISTORY_NAME = "editor.history.entry.guides";
const COMMENTS_HISTORY_NAME = "editor.history.entry.comments";
const FIND_REPLACE_HISTORY_NAME = "editor.history.entry.replaceText";

/** Own annotation/view state and commit document edits through the current page. */
export function useEditorDocumentAids({ focusedPageEngine, bump }) {
  const { showRulers, toggleRulers } = useShowRulers();
  const [showGuides, setShowGuides] = useState(() => getSetting(SHOW_GUIDES_SETTING) !== false);
  const [selectedGuideId, setSelectedGuideId] = useState(null);
  const guideDragOriginRef = useRef(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);

  /**
   * Writes the guide list through the same `setDoc` path every node edit uses,
   * so it persists in `.voo` (scene serialisation already carries `guides`)
   * and lands in undo history exactly once per call.
   */
  const writeDocumentGuides = useCallback(
    (nextGuides, { commit = true } = {}) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      const pageDoc = pageEngine.getDocument();
      if (!pageDoc) return;
      const guides = serialiseGuides(nextGuides);
      pageEngine.setDoc(
        { ...pageDoc, guides },
        commit ? { name: GUIDES_HISTORY_NAME } : { commit: false },
      );
      bump();
    },
    [focusedPageEngine, bump],
  );

  /** Drag out of the ruler: create one guide and one history entry. */
  const handleCreateGuide = useCallback(
    ({ type, pos }) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      const existing = readDocumentGuides(pageEngine.getDocument());
      const created = createGuide({ type, pos }, existing);
      if (!created) return;
      writeDocumentGuides(addGuide(existing, created));
      setSelectedGuideId(created.id);
    },
    [focusedPageEngine, writeDocumentGuides],
  );

  /**
   * Move phases keep the drag atomic: `begin` snapshots the document, the
   * previews write without committing, and `commit` pushes a single entry.
   * `cancel` restores the snapshot (used by Escape and by drop-on-ruler).
   */
  const handleMoveGuide = useCallback(
    (id, pos, phase) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      if (phase === "begin") {
        guideDragOriginRef.current = pageEngine.getDocument();
        return;
      }
      if (phase === "cancel" || phase === "preview") {
        // Previews are drawn by the overlay from its own draft state; the
        // document is untouched until release, so a drag never re-renders the
        // whole editor on every pointer move and never spams history.
        if (phase === "cancel") guideDragOriginRef.current = null;
        return;
      }
      // Commit from the drag's origin snapshot so a multi-step move is one
      // entry; keyboard nudges have no snapshot and commit from the live doc.
      const baseDoc = guideDragOriginRef.current ?? pageEngine.getDocument();
      guideDragOriginRef.current = null;
      const guides = readDocumentGuides(baseDoc);
      writeDocumentGuides(updateGuide(guides, id, pos));
    },
    [focusedPageEngine, writeDocumentGuides],
  );

  const handleRemoveGuide = useCallback(
    (id) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      const guides = readDocumentGuides(pageEngine.getDocument());
      if (!guides.some((guide) => guide.id === id)) return;
      writeDocumentGuides(removeGuide(guides, id));
      setSelectedGuideId((current) => (current === id ? null : current));
    },
    [focusedPageEngine, writeDocumentGuides],
  );

  const handleClearGuides = useCallback(() => {
    const pageEngine = focusedPageEngine();
    if (!pageEngine) return;
    if (readDocumentGuides(pageEngine.getDocument()).length === 0) return;
    writeDocumentGuides([]);
    setSelectedGuideId(null);
  }, [focusedPageEngine, writeDocumentGuides]);

  /**
   * Comment edits go through the focused page's `setDoc` exactly once, named
   * so Undo reads "Comments". The mutator returns the same document for a
   * no-op (empty body, unknown thread), which skips the history entry.
   */
  const mutateDocumentComments = useCallback(
    (mutate) => {
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return false;
      const pageDoc = pageEngine.getDocument();
      if (!pageDoc) return false;
      const base = {
        ...pageDoc,
        comments: normalizeComments(pageDoc.comments),
      };
      const nextDoc = mutate(base);
      if (!nextDoc || nextDoc === base) return false;
      pageEngine.setDoc(
        { ...nextDoc, comments: serializeComments(nextDoc) },
        { name: COMMENTS_HISTORY_NAME },
      );
      bump();
      return true;
    },
    [focusedPageEngine, bump],
  );

  const handleCreateComment = useCallback(
    (x, y, body, author) => {
      mutateDocumentComments((pageDoc) =>
        addComment(pageDoc, { x, y, body, author }),
      );
    },
    [mutateDocumentComments],
  );

  const handleReplyComment = useCallback(
    (commentId, body, author) => {
      mutateDocumentComments((pageDoc) =>
        addReply(pageDoc, commentId, { body, author }),
      );
    },
    [mutateDocumentComments],
  );

  const handleResolveComment = useCallback(
    (commentId, resolved) => {
      mutateDocumentComments((pageDoc) =>
        setResolved(pageDoc, commentId, resolved),
      );
    },
    [mutateDocumentComments],
  );

  const handleDeleteComment = useCallback(
    (commentId) => {
      mutateDocumentComments((pageDoc) => deleteComment(pageDoc, commentId));
    },
    [mutateDocumentComments],
  );

  const closeComments = useCallback(() => {
    setCommentsOpen(false);
    setCommentMode(false);
  }, []);

  const toggleCommentsPanel = useCallback(() => {
    setCommentsOpen((previous) => !previous);
  }, []);

  const toggleCommentMode = useCallback(() => {
    setCommentMode((previous) => !previous);
  }, []);

  // Closing the panel disarms placement too, so the canvas never stays in a
  // click-to-comment mode with no visible way out.
  useEffect(() => {
    if (!commentsOpen) setCommentMode(false);
  }, [commentsOpen]);

  const toggleGuides = useCallback(() => {
    setShowGuides((previous) => {
      const next = !previous;
      void setSetting(SHOW_GUIDES_SETTING, next);
      if (!next) setSelectedGuideId(null);
      return next;
    });
  }, []);

  const openFindReplace = useCallback(() => {
    setFindReplaceOpen(true);
  }, []);

  const closeFindReplace = useCallback(() => {
    setFindReplaceOpen(false);
  }, []);

  /** Selects the text layer that owns a find match, leaving the bar focused. */
  const focusFindMatch = useCallback(
    (match) => {
      if (!match?.nodeId) return;
      const pageEngine = focusedPageEngine();
      pageEngine?.selectNode?.(match.nodeId);
    },
    [focusedPageEngine],
  );

  /**
   * Commits a find & replace document through the focused page engine, named so
   * Undo reads "Find and replace" and Replace All lands as exactly one entry.
   */
  const applyFindReplaceDoc = useCallback(
    (nextDoc) => {
      if (!nextDoc) return;
      const pageEngine = focusedPageEngine();
      if (!pageEngine) return;
      if (pageEngine.getDocument?.() === nextDoc) return;
      pageEngine.setDoc(nextDoc, { name: FIND_REPLACE_HISTORY_NAME });
      bump();
    },
    [focusedPageEngine, bump],
  );

  return {
    showRulers, toggleRulers, showGuides, toggleGuides,
    selectedGuideId, setSelectedGuideId,
    handleCreateGuide, handleMoveGuide, handleRemoveGuide, handleClearGuides,
    commentsOpen, setCommentsOpen, commentMode, closeComments,
    toggleCommentsPanel, toggleCommentMode,
    handleCreateComment, handleReplyComment, handleResolveComment, handleDeleteComment,
    findReplaceOpen, openFindReplace, closeFindReplace, focusFindMatch, applyFindReplaceDoc,
  };
}
