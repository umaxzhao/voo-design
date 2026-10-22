/**
 * Saved assistant conversations, kept on this device. Ported from the voo-run
 * panel's history module, minus its per-Agent-node namespaces.
 */

const STORAGE_KEY = "voo_design_agent_sessions_v1";
const MAX_SESSIONS = 30;

function sessionTitle(session) {
  if (typeof session.title === "string" && session.title) return session.title;
  const first = session.messages?.find((message) => message.role === "user");
  return typeof first?.content === "string" ? first.content.slice(0, 24) : "";
}

export function createSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptySession(id = createSessionId()) {
  return { id, title: "", createdAt: Date.now(), updatedAt: Date.now(), messages: [], history: [] };
}

export function loadStoredSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((session) => ({ ...session, title: sessionTitle(session) }))
      : [];
  } catch {
    return [];
  }
}

/** Writes the list; a full or unavailable store reports it instead of throwing. */
export function saveStoredSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

export function upsertSession(sessions, session) {
  const updated = { ...session, updatedAt: Date.now(), title: sessionTitle(session) };
  const index = sessions.findIndex((entry) => entry.id === session.id);
  const next = index >= 0 ? sessions.map((entry, i) => (i === index ? updated : entry)) : [updated, ...sessions];
  return next.slice(0, MAX_SESSIONS);
}

export function deleteSessionFromList(sessions, sessionId) {
  return sessions.filter((session) => session.id !== sessionId);
}
