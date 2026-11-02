/** Finds the first balanced JSON object or array in a chat reply. */
export function extractJsonReply(text) {
  const source = String(text ?? "");
  const start = source.search(/[[{]/);
  if (start < 0) return null;
  const open = source[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

/** A complete, parseable JSON value prevents harvesting a paused stream. */
export function hasCompleteJsonReply(text) {
  const json = extractJsonReply(text);
  if (!json) return false;
  try {
    JSON.parse(json);
    return true;
  } catch {
    return false;
  }
}
