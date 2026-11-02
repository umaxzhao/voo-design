/**
 * Canvas comment threads — the pure, document-scoped model.
 *
 * Comments live on the page document (`doc.comments`), beside `nodes` and
 * `guides`, so they travel with the file, undo with the document history, and
 * are read through whichever engine owns that page. A comment is a point in
 * document coordinates with a first message and a flat reply list:
 *
 *   { id, x, y, resolved, createdAt,
 *     author: { id, name, avatarSeed },
 *     messages: [{ id, author, body, createdAt }] }
 *
 * Everything here is deliberately tolerant: documents written before comments
 * existed have no field at all, and a hand-edited or partially synced file can
 * arrive with holes. A bad comment must never fail a document load, so reads
 * drop invalid points/entries and coerce what can be coerced instead of
 * throwing. Only the mutation helpers return a document, and they return the
 * same reference when nothing changed so callers can skip a history entry.
 */

/** Longest body a single message keeps; paste accidents should not bloat a file. */
export const MAX_COMMENT_BODY = 4000;

let fallbackIdCounter = 0;

/** A short, collision-resistant id. `crypto.randomUUID` is absent in some embeddings. */
function randomId(prefix) {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (typeof uuid === "string" && uuid) return `${prefix}_${uuid}`;
  } catch {
    // Fall through to the counter.
  }
  fallbackIdCounter += 1;
  const time = Date.now().toString(36);
  const random = Math.floor(Math.random() * 1_000_000).toString(36);
  return `${prefix}_${time}${fallbackIdCounter.toString(36)}${random}`;
}

function uniqueId(prefix, used, preferred = null) {
  const candidate =
    typeof preferred === "string" ? preferred.trim() : String(preferred ?? "").trim();
  if (candidate && !used.has(candidate)) return candidate;
  let next = randomId(prefix);
  while (used.has(next)) next = randomId(prefix);
  return next;
}

function textOf(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function bodyOf(value) {
  const text = textOf(value).trim();
  return text.length > MAX_COMMENT_BODY
    ? text.slice(0, MAX_COMMENT_BODY)
    : text;
}

function finiteNumber(value) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(number) ? number : null;
}

function timeOf(value) {
  const direct = finiteNumber(value);
  if (direct !== null) return direct;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function flagOf(value) {
  return value === true || value === 1 || value === "true" || value === "1";
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

/** A comment author; a bare string is accepted as a legacy name. */
function normalizeAuthor(value, fallback = {}) {
  if (typeof value === "string") {
    const name = value.trim();
    return { id: "", name, avatarSeed: name };
  }
  const record = asRecord(value);
  if (!record) {
    return {
      id: textOf(fallback.id).trim(),
      name: textOf(fallback.name).trim(),
      avatarSeed: textOf(fallback.avatarSeed).trim(),
    };
  }
  const id = textOf(record.id).trim();
  const name = textOf(record.name).trim();
  const avatarSeed = textOf(record.avatarSeed).trim();
  return { id, name, avatarSeed };
}

function rawCommentList(value) {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (record && Array.isArray(record.comments)) return record.comments;
  return [];
}

function normalizeMessage(raw, usedIds) {
  const record = asRecord(raw);
  if (!record) return null;
  const body = bodyOf(record.body ?? record.text ?? record.message);
  if (!body) return null;
  const id = uniqueId("comment_message", usedIds, record.id);
  usedIds.add(id);
  return {
    id,
    author: normalizeAuthor(record.author),
    body,
    createdAt: timeOf(record.createdAt ?? record.created_at),
  };
}

/**
 * Tolerant read of a comment list.
 *
 * Accepts an array, a document (`{ comments }`), or the value `undefined` from
 * an older file. Invalid entries (no finite point) are dropped; missing ids are
 * generated; duplicate ids are replaced so React keys stay unique; string
 * fields and numeric strings are coerced. Never throws.
 */
export function normalizeComments(value) {
  let list;
  if (typeof value === "string") {
    try {
      list = rawCommentList(JSON.parse(value));
    } catch {
      return [];
    }
  } else {
    list = rawCommentList(value);
  }
  if (!Array.isArray(list) || list.length === 0) return [];

  const usedCommentIds = new Set();
  const usedMessageIds = new Set();
  const comments = [];

  for (const raw of list) {
    const record = asRecord(raw);
    if (!record) continue;
    const x = finiteNumber(record.x ?? record.left);
    const y = finiteNumber(record.y ?? record.top);
    if (x === null || y === null) continue;

    const id = uniqueId("comment", usedCommentIds, record.id);
    usedCommentIds.add(id);

    const rawMessages = Array.isArray(record.messages)
      ? record.messages
      : // A legacy shape kept only a top-level body; keep the thought.
        record.body
        ? [{ body: record.body, author: record.author, createdAt: record.createdAt }]
        : [];
    const messages = [];
    for (let index = 0; index < rawMessages.length; index += 1) {
      const message = normalizeMessage(rawMessages[index], usedMessageIds);
      if (message) messages.push(message);
    }

    comments.push({
      id,
      x,
      y,
      resolved: flagOf(record.resolved),
      createdAt: timeOf(record.createdAt),
      author: normalizeAuthor(
        record.author ?? messages[0]?.author ?? { name: "" },
      ),
      messages,
    });
  }
  return comments;
}

/** Comments newest-first; ties break on id so the order is stable. */
export function sortedComments(comments) {
  const list = normalizeComments(comments);
  return list.sort(
    (a, b) =>
      (b?.createdAt ?? 0) - (a?.createdAt ?? 0) ||
      textOf(a?.id).localeCompare(textOf(b?.id)),
  );
}

/** Open (unresolved) threads, newest-first. */
export function listOpenComments(comments) {
  return sortedComments(comments).filter((comment) => !comment.resolved);
}

/** Number of open threads — the badge on the panel. */
export function countOpen(comments) {
  return normalizeComments(comments).reduce(
    (count, comment) => count + (comment.resolved ? 0 : 1),
    0,
  );
}

/**
 * The topmost comment whose pin is within `slop` document units of `docPoint`.
 *
 * `slop` is in document units, so the caller divides its screen-pixel hit
 * radius by zoom. Later comments are painted on top, so on a tie the later one
 * wins, matching what the pointer appears to hit.
 */
export function hitTestComment(comments, docPoint, slop = 0) {
  const list = normalizeComments(comments);
  const x = finiteNumber(docPoint?.x);
  const y = finiteNumber(docPoint?.y);
  const radius = Math.max(0, finiteNumber(slop) ?? 0);
  if (x === null || y === null) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const comment of list) {
    const distance = Math.hypot(comment.x - x, comment.y - y);
    if (distance > radius) continue;
    if (best === null || distance <= bestDistance) {
      best = comment;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Adds a comment with its first message.
 *
 * Returns the input document unchanged when the point or body is invalid, so a
 * caller can avoid pushing an undo entry for a no-op. A supplied `id` that is
 * already taken is ignored in favour of a fresh one rather than overwriting.
 */
export function addComment(doc, { x, y, body, author, id } = {}) {
  const base = asRecord(doc) ? doc : {};
  const px = finiteNumber(x);
  const py = finiteNumber(y);
  const text = bodyOf(body);
  if (px === null || py === null || !text) return doc;

  const comments = normalizeComments(base.comments);
  const usedCommentIds = new Set(comments.map((comment) => comment.id));
  const usedMessageIds = new Set();
  for (const comment of comments) {
    for (const message of comment.messages) usedMessageIds.add(message.id);
  }

  const now = Date.now();
  const commentId = uniqueId("comment", usedCommentIds, id);
  usedCommentIds.add(commentId);
  const messageId = uniqueId("comment_message", usedMessageIds);
  const normalizedAuthor = normalizeAuthor(author);

  return {
    ...base,
    comments: [
      ...comments,
      {
        id: commentId,
        x: px,
        y: py,
        resolved: false,
        createdAt: now,
        author: normalizedAuthor,
        messages: [
          {
            id: messageId,
            author: normalizedAuthor,
            body: text,
            createdAt: now,
          },
        ],
      },
    ],
  };
}

/** Appends a reply. Returns the same document when the thread or body is missing. */
export function addReply(doc, commentId, { body, author, id } = {}) {
  const base = asRecord(doc) ? doc : null;
  if (!base) return doc;
  const targetId = textOf(commentId).trim();
  if (!targetId) return doc;
  const text = bodyOf(body);
  if (!text) return doc;

  const comments = normalizeComments(base.comments);
  const index = comments.findIndex((comment) => comment.id === targetId);
  if (index < 0) return doc;

  const usedMessageIds = new Set();
  for (const comment of comments) {
    for (const message of comment.messages) usedMessageIds.add(message.id);
  }
  const messageId = uniqueId("comment_message", usedMessageIds, id);
  const normalizedAuthor = normalizeAuthor(author);
  const nextComments = comments.slice();
  nextComments[index] = {
    ...comments[index],
    messages: [
      ...comments[index].messages,
      {
        id: messageId,
        author: normalizedAuthor,
        body: text,
        createdAt: Date.now(),
      },
    ],
  };
  return { ...base, comments: nextComments };
}

/** Marks a thread resolved or open. Same-reference no-op when nothing changes. */
export function setResolved(doc, commentId, resolved) {
  const base = asRecord(doc) ? doc : null;
  if (!base) return doc;
  const targetId = textOf(commentId).trim();
  const nextResolved = Boolean(resolved);
  const comments = normalizeComments(base.comments);
  const index = comments.findIndex((comment) => comment.id === targetId);
  if (index < 0) return doc;
  if (comments[index].resolved === nextResolved) return doc;
  const nextComments = comments.slice();
  nextComments[index] = { ...comments[index], resolved: nextResolved };
  return { ...base, comments: nextComments };
}

/** Removes a thread and all its messages. Same reference when not found. */
export function deleteComment(doc, commentId) {
  const base = asRecord(doc) ? doc : null;
  if (!base) return doc;
  const targetId = textOf(commentId).trim();
  const comments = normalizeComments(base.comments);
  if (!comments.some((comment) => comment.id === targetId)) return doc;
  return {
    ...base,
    comments: comments.filter((comment) => comment.id !== targetId),
  };
}

/**
 * The comments to persist for a document.
 *
 * Returns a plain, normalized array (never a document wrapper), so the scene
 * serialiser can write `comments: serializeComments(doc)` directly.
 */
export function serializeComments(doc) {
  return normalizeComments(
    Array.isArray(doc) ? doc : asRecord(doc)?.comments ?? [],
  );
}

/**
 * Reads comments out of a raw decoded document (or a bare stored array).
 *
 * The load path already calls `normalizeComments` internally, so this is the
 * named contract the serialiser can use without knowing the model's shape.
 */
export function deserializeComments(rawDoc) {
  return normalizeComments(
    Array.isArray(rawDoc) ? rawDoc : asRecord(rawDoc)?.comments ?? [],
  );
}
