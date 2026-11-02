import { useState } from "react";
import { renameSessionInList, saveStoredSessions } from "../../agent/session_history.js";

/** Rename helper keeps the persisted session title in sync with panel state. */
export function useSessionRename(sessionsRef, setSessions, isBusy) {
  const [sessionId, setSessionId] = useState(null);
  const [draft, setDraft] = useState("");
  const rename = (targetId, title) => {
    if (isBusy() || !title.trim()) return;
    const next = renameSessionInList(sessionsRef.current, targetId, title);
    sessionsRef.current = next;
    setSessions(next);
    saveStoredSessions(next);
    setSessionId(null);
    setDraft("");
  };
  return { sessionId, setSessionId, draft, setDraft, rename };
}
