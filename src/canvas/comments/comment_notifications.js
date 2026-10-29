/**
 * Local "new comment" notifications.
 *
 * Collaboration delivers the threads; this module answers "which of them
 * changed since the user last looked?" without adding per-message read state
 * to the document. The last-seen timestamp is a local preference (one user,
 * one device), like the editor theme.
 */

export const COMMENT_SEEN_SETTING = "voo.comments.lastSeen";

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readCommentSeenAt() {
  try {
    const raw = safeStorage()?.getItem(COMMENT_SEEN_SETTING);
    const value = raw ? Number(JSON.parse(raw)) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeCommentSeenAt(timestamp = Date.now()) {
  try {
    safeStorage()?.setItem(COMMENT_SEEN_SETTING, JSON.stringify(Number(timestamp)));
  } catch {
    // A private-mode browser may refuse storage; notifications just stay unread.
  }
  return Number(timestamp);
}

function activityTime(value) {
  // The canonical comment model stores epoch milliseconds; legacy documents
  // still carry ISO strings. Date.parse(number) interprets it as date text.
  const parsed = typeof value === "number" ? value : Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function messageTime(message) {
  return activityTime(message?.createdAt);
}

/** Newest message time in a thread (0 when it has none). */
export function threadLastActivity(comment) {
  return (comment?.messages ?? []).reduce(
    (latest, message) => Math.max(latest, messageTime(message)),
    threadLastActivityFallback(comment),
  );
}

function threadLastActivityFallback(comment) {
  return activityTime(comment?.createdAt);
}

/** Threads whose latest message is newer than the last time the panel was seen. */
export function unreadCommentIds(comments = [], seenAt = 0) {
  return comments
    .filter((comment) => threadLastActivity(comment) > seenAt)
    .map((comment) => comment.id);
}

export function unreadCommentCount(comments = [], seenAt = 0) {
  return unreadCommentIds(comments, seenAt).length;
}

/** Messages that mention a name (`@name`), newest first — the mention inbox. */
export function mentionedMessages(comments = [], name = "") {
  const needle = String(name ?? "").trim().toLowerCase();
  if (!needle) return [];
  const mentions = [];
  for (const comment of comments) {
    for (const message of comment.messages ?? []) {
      if (String(message?.body ?? "").toLowerCase().includes(`@${needle}`)) {
        mentions.push({ commentId: comment.id, message });
      }
    }
  }
  return mentions.sort((a, b) => messageTime(b.message) - messageTime(a.message));
}
