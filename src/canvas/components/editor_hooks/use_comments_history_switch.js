import { useCallback } from "react";

/** The existing History command replaces Comments instead of opening beneath it. */
export function useCommentsHistorySwitch({ commentsOpen, closeComments, setHistoryOpen }) {
  return useCallback(next => {
    closeComments();
    setHistoryOpen(commentsOpen ? true : next);
  }, [commentsOpen, closeComments, setHistoryOpen]);
}
