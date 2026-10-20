/**
 * Error-item text composition for the message stream.
 *
 * The translated `agent.system.<code>` key is usually the whole sentence, but
 * for generic failure kinds it is only a prefix and the raw `item.message`
 * carries the specific cause (a 401 vs. a network drop vs. a quota error).
 * Keeping that decision in a pure function makes the "detail shown" contract
 * testable without a DOM.
 *
 * @module agent-panel/agentErrorText
 */

/**
 * Error codes whose translated key is a generic prefix rather than the whole
 * message. Codes whose key is already the complete sentence (contextCompacted,
 * contextCompactionFailed, stopped, budgetExhausted, …) are deliberately absent
 * so the notice never repeats itself.
 *
 * The two compaction codes must stay distinct: compaction always truncates the
 * history, but only one of them produced a recap, so neither sentence may
 * absorb the other one's raw `item.message`.
 */
export const ERROR_CODES_WITH_DETAIL = Object.freeze([
  "turnFailed",
  "quotaExceeded",
  "storageError",
]);

const DETAIL_CODES = new Set(ERROR_CODES_WITH_DETAIL);
const LOCALIZED_DETAIL_KEYS = new Set([
  "agent.connection.desktopOnly",
  "agent.connection.linkReadsOnly",
  "agent.connection.loginRequired",
  "agent.connection.notInstalled",
  "agent.connection.unsupported",
  "cli.unsupportedVersion",
  "cli.invalidModelCatalog",
  "cli.invalidAuthStatus",
  "cli.invalidOutput",
  "cli.incompleteOutput",
  "cli.unsupportedContent",
  "cli.toolUnavailable",
  "cli.invalidReasoningEffort",
]);

// Native adapters return stable codes instead of private provider diagnostics.
const CLI_DETAIL_KEYS = Object.freeze({
  "cli.quotaExceeded": "error.tooManyRequests",
  "cli.unauthenticated": "agent.connection.loginRequired",
  "cli.notInstalled": "agent.connection.notInstalled",
  "cli.cancelled": "agent.system.stopped",
  "cli.failed": "agent.connection.failed",
  "cli.connectionClosed": "agent.connection.failed",
  "cli.requestTimeout": "agent.connection.failed",
});

const HTTP_402 = /\b(?:LLM API error|HTTP(?: error)?)\s*402\b|^\s*402\b/i;
/**
 * Upstream failure shapes the credits gateway and the OpenAI-compatible
 * providers return. Each maps to an already-localized actionable sentence
 * instead of the raw `LLM API error <status>: <body>` (AGENT-2).
 */
const GATEWAY_ERROR_PATTERNS = [
  { pattern: /\bmodelNotPriced\b/i, key: "error.modelNotPriced" },
  {
    pattern: /\btooManyRequests\b|\brate.?limit/i,
    key: "error.tooManyRequests",
  },
  {
    pattern: /\bgatewayDisabled\b|\bno available channel\b/i,
    key: "error.upstreamNotConfigured",
  },
];
const STATUS_ERROR_KEYS = {
  429: "error.tooManyRequests",
  503: "error.upstreamNotConfigured",
};
const SERVER_ERROR_PATTERN = /\b(?:LLM API error|HTTP(?: error)?)\s*5\d\d\b/i;
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validCredits = (value) => Number.isSafeInteger(value) && value >= 0;

/**
 * The localized key for a known gateway/HTTP failure, or null when the item
 * should keep its own text. Matched against the message body and the numeric
 * status fields the turn pipeline attaches.
 */
export function gatewayErrorKey(item) {
  const message = typeof item.message === "string" ? item.message : "";
  for (const { pattern, key } of GATEWAY_ERROR_PATTERNS) {
    if (pattern.test(message)) return key;
  }
  const status = item.httpStatus ?? item.statusCode ?? item.status ?? null;
  if (typeof status === "number" && STATUS_ERROR_KEYS[status]) {
    return STATUS_ERROR_KEYS[status];
  }
  const code = item.code ?? "";
  if (typeof code === "string" && STATUS_ERROR_KEYS[Number(code)]) {
    return STATUS_ERROR_KEYS[Number(code)];
  }
  if (SERVER_ERROR_PATTERN.test(message)) {
    // Any other upstream 5xx is the gateway being busy, not the user's graph.
    return "error.providerServerBusy";
  }
  return null;
}

/** Only known codes and numeric credit fields may leave a payment response. */
function creditFailure(item) {
  const message = typeof item.message === "string" ? item.message : "";
  const paymentRequired =
    HTTP_402.test(message) ||
    item.httpStatus === 402 ||
    item.statusCode === 402 ||
    item.status === 402;
  let payload = isRecord(item.details)
    ? item.details
    : isRecord(item.error)
      ? item.error
      : item;
  const body = message.match(
    /(?:LLM API error|HTTP(?: error)?)\s*402\s*:\s*(\{[\s\S]*\})\s*$/i,
  )?.[1];
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (isRecord(parsed)) payload = parsed;
    } catch {
      // An unrecognised payment response gets generic copy, never its raw body.
    }
  }
  const insufficient =
    item.code === "insufficientCredits" ||
    message === "insufficientCredits" ||
    payload.code === "insufficientCredits" ||
    payload.error === "insufficientCredits" ||
    payload.error?.code === "insufficientCredits";
  if (!insufficient)
    return paymentRequired ? { kind: "paymentRequired" } : null;
  const amounts = isRecord(item.params) ? item.params : payload;
  return {
    kind: "insufficientCredits",
    params:
      validCredits(amounts.balance) && validCredits(amounts.required)
        ? { balance: amounts.balance, required: amounts.required }
        : null,
  };
}

export function isInsufficientCreditsError(item) {
  return creditFailure(item)?.kind === "insufficientCredits";
}

export function agentErrorSettingsTarget(item) {
  return creditFailure(item)?.kind === "insufficientCredits" ? "models" : null;
}

/** Compose the visible error sentence for one error item. */
export function formatAgentErrorText(item, t) {
  const credits = creditFailure(item);
  if (credits?.kind === "paymentRequired") return t("agent.system.turnFailed");
  if (credits?.kind === "insufficientCredits") {
    return t(
      credits.params
        ? "agent.error.insufficientCreditsAmounts"
        : "agent.error.insufficientCredits",
      credits.params ?? undefined,
    );
  }
  // Known gateway failures speak in full sentences; their raw bodies carry no
  // extra information a user could act on.
  const gatewayKey = gatewayErrorKey(item);
  if (gatewayKey) return t(gatewayKey);
  const label = item.code
    ? t(`agent.system.${item.code}`, item.params)
    : item.message;
  const detailKey = Object.hasOwn(CLI_DETAIL_KEYS, item.message)
    ? CLI_DETAIL_KEYS[item.message]
    : LOCALIZED_DETAIL_KEYS.has(item.message)
      ? item.message
      : null;
  const detail = detailKey ? t(detailKey) : item.message;
  const text =
    item.message && DETAIL_CODES.has(item.code) ? `${label} ${detail}` : label;
  return text || t("agent.system.unknownError");
}
