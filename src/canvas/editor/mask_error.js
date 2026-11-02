/**
 * Maps a thrown failure to the value the editor's mask error surface shows.
 *
 * Actionable errors (missing API key, insufficient credits, quota exhaustion,
 * route unavailable) must retain their distinct code so the UI can display
 * actionable copy and credit recharge prompts rather than generic failures.
 * Other errors stay the plain boolean the panels already render.
 */
const ACTIONABLE_ERROR_CODES = new Set([
  "providerNotConfigured",
  "insufficientCredits",
  "providerQuota",
  "noRepaintRouteAvailable",
]);

export function maskErrorCode(error) {
  const code =
    typeof error === "string"
      ? error
      : (typeof error?.code === "string"
          ? error.code
          : typeof error?.message === "string"
            ? error.message
            : "");
  if (ACTIONABLE_ERROR_CODES.has(code)) {
    return code;
  }
  if (error?.status === 402 || error?.statusCode === 402) {
    return "insufficientCredits";
  }
  return true;
}

