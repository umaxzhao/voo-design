/**
 * Pure functions for managing agent conversation sessions and history.
 *
 * Data Structure:
 * session = {
 *   id: string,
 *   title: string,
 *   createdAt: number,
 *   updatedAt: number,
 *   events: Array,
 *   messages: Array,
 *   agentNodeId: string|null,
 * }
 *
 * Sessions are namespaced by `agentNodeId`: the global panel keeps the
 * original `voo_agent_sessions_v1` key, and each Agent node gets its own
 * suffixed key so two nodes can never read or overwrite each other's history.
 */

const STORAGE_KEY = "voo_agent_sessions_v1";
const MAX_SESSIONS = 30;

/** Storage key for a namespace; null/"" is the global panel. */
function storageKey(agentNodeId = null) {
  return agentNodeId ? `${STORAGE_KEY}:node:${agentNodeId}` : STORAGE_KEY;
}

function sessionTitle(session) {
  if (typeof session.title === "string" && session.title) return session.title;
  const content = session.title || session.messages?.[0]?.content;
  if (typeof content === "string") return content.slice(0, 24);
  // Multimodal messages contain objects, which React cannot render as titles.
  // Normalize legacy stored titles too, without copying image data into them.
  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join(" ")
      .slice(0, 24);
  }
  return "";
}

export function createSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptySession(id = createSessionId(), agentNodeId = null) {
  return {
    id,
    title: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    events: [],
    messages: [],
    agentNodeId: agentNodeId || null,
  };
}

export function loadStoredSessions(agentNodeId = null) {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(storageKey(agentNodeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((session) => ({ ...session, title: sessionTitle(session) }))
      : [];
  } catch {
    return [];
  }
}

/** First stored session bound to an Agent node, or null when it has none. */
export function getSessionByAgentNode(sessions = [], agentNodeId) {
  if (!agentNodeId) return null;
  return (
    sessions.find((session) => session?.agentNodeId === agentNodeId) ?? null
  );
}

export function saveStoredSessions(sessions, agentNodeId = null) {
  try {
    if (typeof localStorage === "undefined") {
      return {
        ok: false,
        code: "no_storage",
        error: "localStorage is undefined",
      };
    }
    const safe = Array.isArray(sessions) ? sessions.slice(0, MAX_SESSIONS) : [];
    localStorage.setItem(storageKey(agentNodeId), JSON.stringify(safe));
    return { ok: true };
  } catch (err) {
    const isQuota =
      err?.name === "QuotaExceededError" ||
      err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      /quota/i.test(err?.message || "");
    const failureOutcome = {
      ok: false,
      code: isQuota ? "quota_exceeded" : "storage_error",
      error: err?.message || String(err),
    };
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      try {
        const evt =
          typeof CustomEvent === "function"
            ? new CustomEvent("voo:storage-error", { detail: failureOutcome })
            : { type: "voo:storage-error", detail: failureOutcome };
        window.dispatchEvent(evt);
      } catch {
        // Best effort dispatch
      }
    }
    return failureOutcome;
  }
}

export function upsertSession(sessions = [], session) {
  if (!session || !session.id) return sessions;
  const list = Array.isArray(sessions) ? [...sessions] : [];
  const idx = list.findIndex((s) => s.id === session.id);
  const updated = {
    ...session,
    updatedAt: Date.now(),
    title: sessionTitle(session),
  };

  if (idx >= 0) {
    list[idx] = updated;
  } else {
    list.unshift(updated);
  }

  return list.slice(0, MAX_SESSIONS);
}

export function deleteSessionFromList(sessions = [], sessionId) {
  if (!Array.isArray(sessions)) return [];
  return sessions.filter((s) => s.id !== sessionId);
}
