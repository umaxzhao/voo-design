/** Explicit loopback URLs are the only entry to external Codex control. */
export function getCodexWorkbenchSession(
  href = globalThis.window?.location?.href,
) {
  try {
    const url = new URL(href);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(url.hostname)
    )
      return null;
    if (
      url.searchParams.get("desktop") !== "1" ||
      url.searchParams.get("agent") !== "codex"
    )
      return null;
    const sessionId = url.searchParams.get("session");
    return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      sessionId ?? "",
    )
      ? sessionId
      : null;
  } catch {
    return null;
  }
}
