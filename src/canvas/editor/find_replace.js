/**
 * Canvas text find & replace.
 *
 * Pure module: no DOM, no engine, no React. It walks `doc.nodes` in paint order
 * (the document stores nodes bottom-first) and only ever rewrites a text node's
 * `text` string — ids, geometry, typography, effects and every other node are
 * preserved by reference.
 *
 * Whole-word matching uses Unicode letter/number/underscore boundaries rather
 * than JavaScript's `\b`: `\b` treats every CJK ideograph as a non-word
 * character, so "设计" would match inside "设计稿" and inside English words. The
 * lookarounds below make a CJK query behave like a real word on both sides.
 */

const WORD_CHAR = "[\\p{L}\\p{N}_]";
const WORD_ONLY = /^[\p{L}\p{N}_]+$/u;
const MAX_REGEX_LENGTH = 4000;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles the search query into a global regex.
 *
 * @returns {RegExp|null} null for an empty/oversized query
 */
export function buildTextMatcher({
  query,
  caseSensitive = false,
  wholeWord = false,
} = {}) {
  const normalized = typeof query === "string" ? query : "";
  if (!normalized || normalized.length > MAX_REGEX_LENGTH) return null;
  const escaped = escapeRegExp(normalized);
  // Boundary assertions only make sense when the query itself contains word
  // characters; searching for "--" must still match "--" inside "a--b".
  const useBoundaries = Boolean(wholeWord) && WORD_ONLY.test(normalized);
  const body = useBoundaries
    ? `(?<!${WORD_CHAR})(?:${escaped})(?!${WORD_CHAR})`
    : escaped;
  try {
    return new RegExp(body, caseSensitive ? "gu" : "giu");
  } catch {
    return null;
  }
}

/**
 * All matches across the document, in paint order.
 *
 * @returns {Array<{nodeId:string,start:number,end:number,text:string,
 *   matchIndex:number}>} `matchIndex` is the global match order (0-based)
 */
export function findTextMatches(doc, options = {}) {
  if (!doc || !Array.isArray(doc.nodes)) return [];
  const matcher = buildTextMatcher(options);
  if (!matcher) return [];
  const matches = [];
  let matchIndex = 0;
  for (const node of doc.nodes) {
    if (!node || node.kind !== "text" || typeof node.text !== "string") {
      continue;
    }
    matcher.lastIndex = 0;
    let found = matcher.exec(node.text);
    while (found) {
      if (found[0].length === 0) {
        // A zero-length pattern can never come out of an empty query; this is
        // a defensive guard so a hand-built matcher cannot spin forever.
        matcher.lastIndex += 1;
      } else {
        matches.push({
          nodeId: node.id,
          start: found.index,
          end: found.index + found[0].length,
          text: found[0],
          matchIndex,
        });
        matchIndex += 1;
      }
      found = matcher.exec(node.text);
    }
  }
  return matches;
}

function nodeById(doc, nodeId) {
  return (doc?.nodes ?? []).find((node) => node.id === nodeId) ?? null;
}

/**
 * Replaces one match. Returns the same document object when the match is stale,
 * points at a non-text node, or the replacement leaves the text unchanged.
 */
export function replaceOne(doc, match, replacement) {
  const empty = { doc, replaced: false };
  if (!doc || !Array.isArray(doc.nodes) || !match) return empty;
  const node = nodeById(doc, match.nodeId);
  if (!node || node.kind !== "text" || typeof node.text !== "string") {
    return empty;
  }
  const start = Number(match.start);
  const end = Number(match.end);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return empty;
  if (start < 0 || end <= start || end > node.text.length) return empty;
  // A stale match (the document changed since it was found) must not cut a
  // range that no longer holds the searched text.
  if (typeof match.text === "string" && node.text.slice(start, end) !== match.text) {
    return empty;
  }
  const replacementText = String(replacement ?? "");
  const nextText =
    node.text.slice(0, start) + replacementText + node.text.slice(end);
  if (nextText === node.text) return empty;
  return {
    doc: {
      ...doc,
      nodes: doc.nodes.map((candidate) =>
        candidate.id === node.id ? { ...candidate, text: nextText } : candidate,
      ),
    },
    replaced: true,
  };
}

/**
 * Replaces every match in one pass. Each node's ranges are applied from the end
 * of the string backwards so earlier offsets stay valid; matches are counted
 * across nodes, not per node.
 *
 * @returns {{doc:object, count:number}} `count` is the number of occurrences
 *   found; the document object is unchanged when no text actually differs.
 */
export function replaceAll(doc, options, replacement) {
  const matches = findTextMatches(doc, options);
  if (matches.length === 0) return { doc, count: 0 };
  const replacementText = String(replacement ?? "");
  const rangesByNode = new Map();
  for (const match of matches) {
    const ranges = rangesByNode.get(match.nodeId) ?? [];
    ranges.push(match);
    rangesByNode.set(match.nodeId, ranges);
  }
  let changed = false;
  const nodes = doc.nodes.map((node) => {
    const ranges = rangesByNode.get(node.id);
    if (!ranges || typeof node.text !== "string") return node;
    let text = node.text;
    const ordered = [...ranges].sort((left, right) => right.start - left.start);
    for (const range of ordered) {
      text =
        text.slice(0, range.start) + replacementText + text.slice(range.end);
    }
    if (text === node.text) return node;
    changed = true;
    return { ...node, text };
  });
  if (!changed) return { doc, count: matches.length };
  return { doc: { ...doc, nodes }, count: matches.length };
}
