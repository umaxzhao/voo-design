import { t } from "../shared/i18n.js";
import { localUnsupportedMessageKey } from "../shared/local_capabilities.js";
import { PROVIDER_ID } from "../shared/providers.js";

/** Maps adapter/executor error codes onto localized, actionable messages. */
const CODE_TO_KEY = {
  agentStepLimit: "agent.error.agentStepLimit",
  agentNoCanvasContent: "agent.error.agentNoCanvasContent",
  noPlatform: "error.noPlatform",
  // A Batch node whose input has no runnable node wired into it.
  batchNoMembers: "node.batch.error.noMembers",
  // Storyboard split / render failures (engine/storyboard_run.js).
  storyboardNoStory: "node.storyboard.error.noStory",
  storyboardParse: "node.storyboard.error.parse",
  storyboardSplitModelMissing: "node.storyboard.error.splitModelMissing",
  storyboardEmpty: "node.storyboard.error.empty",
  storyboardKeyframeStale: "node.storyboard.error.keyframeStale",
  storyboardSheetIncomplete: "node.storyboard.error.sheetIncomplete",
  storyboardSheetStale: "node.storyboard.error.sheetStale",
  // An Agent Gen node that has no standing brief, or no model to run with.
  agentNodeBriefRequired: "node.agent.error.briefRequired",
  agentNodeProviderRequired: "node.agent.error.providerRequired",
  // Standalone editor without the extension: chat/jimeng nodes cannot run.
  extensionRequired: "error.extensionRequired",
  quotaExceeded: "error.quotaExceeded",
  chromeLaunchFailed: "error.chromeLaunchFailed",
  composerMissing: "error.composerMissing",
  "composer-not-editable": "error.composerWriteFailed",
  "composer-write-failed": "error.composerWriteFailed",
  sendMissing: "error.sendMissing",
  probeFailed: "error.probeFailed",
  uploadMissing: "error.uploadMissing",
  uploadIncomplete: "error.uploadIncomplete",
  newChatMissing: "error.newChatMissing",
  timeout: "error.timeout",
  noImage: "error.noImage",
  noVideo: "error.noVideo",
  textUnsupported: "error.textUnsupported",
  modeSwitchMissing: "error.modeSwitchMissing",
  jimengModelControlMissing: "error.jimengModelControlMissing",
  jimengModelOptionMissing: "error.jimengModelOptionMissing",
  jimengSettingsControlMissing: "error.jimengSettingsControlMissing",
  jimengAspectRatioOptionMissing: "error.jimengAspectRatioOptionMissing",
  jimengResolutionOptionMissing: "error.jimengResolutionOptionMissing",
  jimengCountOptionMissing: "error.jimengCountOptionMissing",
  midjourneyRoleMissing: "error.midjourneyRoleMissing",
  midjourneyUploadMissing: "error.midjourneyUploadMissing",
  tripoAdapterMissing: "error.staleContentScript",
  tripoLoginRequired: "error.tripoLoginRequired",
  tripoModeMissing: "error.tripoModeMissing",
  tripoMeshModeMissing: "error.tripoMeshModeMissing",
  tripoTopologyMissing: "error.tripoTopologyMissing",
  tripoAiModelMissing: "error.tripoAiModelMissing",
  tripoUploadMissing: "error.tripoUploadMissing",
  tripoComposerMissing: "error.tripoComposerMissing",
  tripoSubmitMissing: "error.tripoSubmitMissing",
  tripoInputNotReady: "error.tripoInputNotReady",
  tripoSingleImageOnly: "error.tripoSingleImageOnly",
  tripoGenerationTimeout: "error.tripoGenerationTimeout",
  tripoExportMissing: "error.tripoExportUnavailable",
  tripoExportFormatMissing: "error.tripoExportUnavailable",
  tripoDownloadBusy: "error.tripoDownloadBusy",
  tripoDownloadTimeout: "error.tripoDownloadTimeout",
  tripoDownloadFailed: "error.tripoDownloadFailed",
  // The content script rejected a method it has never heard of, which in
  // practice always means the page still runs a content script from an older
  // build of the extension.
  unknownMethod: "error.staleContentScript",
  extensionReloaded: "error.staleContentScript",
  extensionOutdated: "error.extensionOutdated",
  unsupportedMessage: "error.extensionOutdated",
  payloadTooLarge: "error.payloadTooLarge",
  mediaGenerationIncomplete: "error.mediaGenerationIncomplete",
  mediaCollectionIncomplete: "error.mediaCollectionIncomplete",
  webRecoveryUnavailable: "error.webRecoveryUnavailable",
  webSubmissionUncertain: "error.webSubmissionUncertain",
  webSessionChanged: "error.webSessionChanged",
  webSessionBusy: "error.webSessionBusy",
  noText: "error.noText",
  staleReply: "error.staleReply",
  replyIncomplete: "error.replyIncomplete",
  emptyPrompt: "error.emptyPrompt",
  layoutParse: "error.layoutParse",
  layoutModuleLoad: "error.layoutModuleLoad",
  layoutReferenceMissing: "error.layoutReferenceMissing",
  layoutReferenceUnreadable: "error.layoutReferenceUnreadable",
  layoutReferenceVisionRequired: "error.layoutReferenceVisionRequired",
  layoutNoHtml: "error.layoutNoHtml",
  emptyGraph: "run.emptyGraph",
  cycle: "run.cycle",
  nodeMissing: "error.generic",
  platformTabMissing: "error.platformTabMissing",
  // The node is pinned to a website the user has turned off ("Hidden"), which
  // the run now refuses instead of silently driving it or silently moving the
  // user onto a paid API route. See engine/executor_target.js.
  platformDisabled: "error.platformDisabled",
  // A `?templateId=` deep link that no catalogue entry answers: the starter
  // canvas loads instead, and the banner says so rather than dying silently.
  templateDeepLinkMissed: "error.templateDeepLinkMissed",
  platformTabLoadTimeout: "error.platformTabLoadTimeout",
  platformTabNotReady: "error.platformTabNotReady",
  loginRequired: "error.loginRequired",
  platformTabClosed: "error.platformTabClosed",
  jobTimeout: "error.jobTimeout",
  needSidePanel: "error.needSidePanel",
  providerStorageUnavailable: "error.providerStorageUnavailable",
  providerKeyRequired: "error.providerKeyRequired",
  providerKeyRequiredForBaseUrlChange:
    "error.providerKeyRequiredForBaseUrlChange",
  providerNotConfigured: "error.providerNotConfigured",
  insufficientCredits: "error.insufficientCredits",
  modelNotPriced: "error.modelNotPriced",
  upstreamNotConfigured: "error.upstreamNotConfigured",
  tooManyRequests: "error.tooManyRequests",
  // Repaint has no configured API provider AND the current environment cannot
  // reach a chat page (voo.run hosted/standalone) — an actionable gap, not a
  // silent failure.
  noRepaintRouteAvailable: "error.noRepaintRouteAvailable",
  providerUnauthorized: "error.providerUnauthorized",
  providerRequestFailed: "error.providerRequestFailed",
  providerTransparentFormatRequired: "error.providerTransparentFormatRequired",
  layerMaskNotReady: "error.layerMaskNotReady",
  providerNetworkError: "error.providerNetworkError",
  mediaUploadNetworkError: "error.mediaUploadNetworkError",
  providerTimeout: "error.providerTimeout",
  providerUnsupported: "error.providerUnsupported",
  providerInvalidBaseUrl: "error.providerInvalidBaseUrl",
  providerHostDenied: "error.providerHostDenied",
  providerUnsupportedMedia: "error.providerUnsupportedMedia",
  providerModelRequired: "error.providerModelRequired",
  providerInvalidResponse: "error.providerInvalidResponse",
  providerJobFailed: "error.providerJobFailed",
  providerNoResult: "error.providerNoResult",
  providerQuota: "error.providerQuota",
  providerModerationBlocked: "error.providerModerationBlocked",
  providerServerBusy: "error.providerServerBusy",
  providerModelNotFound: "error.providerModelNotFound",
  providerChannelUnavailable: "error.providerChannelUnavailable",
  providerUpstreamTimeout: "error.providerUpstreamTimeout",
  videoDurationInvalid: "error.videoDurationInvalid",
  videoDurationUnsupported: "error.videoDurationUnsupported",
  // Local CLI agents (Claude Code / Codex / Antigravity). The PICKER's own
  // status wording lives under `agent.connection.*`; these are the RUN-time
  // failures, which until now reached the screen as the bare code — a user
  // whose picker said "Connected" read `cli.notInstalled` in the agent panel
  // with nothing telling them what to do about it.
  "cli.notInstalled": "error.cliNotInstalled",
  "cli.unauthorizedSender": "error.cliUnauthorizedSender",
  "cli.connectionClosed": "error.cliConnectionClosed",
  "cli.bridgeDisconnected": "error.cliBridgeDisconnected",
  "cli.sessionBusy": "error.cliSessionBusy",
  "cli.requestTimeout": "error.cliRequestTimeout",
  "cli.emptyPrompt": "error.emptyPrompt",
  // The bridge reports these for an unrecognised/unavailable channel rather
  // than a specific cause; both mean "this agent route is not usable here".
  "cli.unknown": "error.cliFailed",
  "cli.failed": "error.cliFailed",
  // The managed local engine. Its
  // sentences already exist in both dictionaries; they were simply unreachable
  // by code, so a stopped engine surfaced as "Failed: localBackend.unreachable"
  // on every surface that goes through this table (docs/plan-qwen21-primary.md
  // §3.2). `localBackend.mediaUnsupported` is resolved by medium in
  // `resolveError`, because one sentence cannot fit both an image edit and video.
  "localBackend.unreachable": "localBackend.unreachable",
  "localBackend.blockedByHttps": "localBackend.blockedByHttps",
  "localBackend.noCheckpoint": "localBackend.noCheckpoint",
  "localBackend.mediaUnsupported": "localBackend.mediaUnsupported",
};

/**
 * Whether `code` is a machine code this module owns copy for.
 *
 * Callers that must render a failure themselves (the layout stream, which
 * prefixes its own sentence) use this to tell a real error code apart from an
 * error whose `code` is just its own human-readable message — only the former
 * may be translated, the latter is already a sentence.
 *
 * @param {unknown} code
 * @returns {boolean}
 */
export function isKnownErrorCode(code) {
  return typeof code === "string" && Object.hasOwn(CODE_TO_KEY, code);
}

const QUOTA_PATTERN =
  /(?:insufficient[_\s-]*quota|quota\s+(?:exhausted|exceeded|not\s+enough)|\b429\b|balance|arrears|exceeded\s+current\s+quota)/i;

const MODERATION_PATTERN =
  /(?:sensitive\s*words?|nsfw|content\s*moderation|content\s*policy|violate(?:d|s)?\s*policy|prohibited|safety|inappropriate|safety\s*reasons?)/i;

const SERVER_BUSY_PATTERN =
  /(?:server\s*(?:is\s*)?busy|overloaded|queue\s*full|concurrency\s*limit|rate\s*limit|too\s*many\s*requests|temporarily\s*unavailable|\b503\b)/i;

const MODEL_NOT_FOUND_PATTERN =
  /(?:model[_\s-]*not[_\s-]*found|invalid\s*model|does\s*not\s*exist|model\s*is\s*not\s*available)/i;

const CHANNEL_UNAVAILABLE_PATTERN =
  /(?:no\s+available\s+channels?|channel[_\s-]*unavailable|暂无可用通道)/i;

const UPSTREAM_TIMEOUT_PATTERN =
  /(?:network\s+error\s+after\s+\d+\s+retries|timeouterror|upstream\s+timeout|gateway\s+timeout)/i;

/**
 * The dictionary key for a local-backend code, when the dictionary has one.
 *
 * The provider layer raises a closed set of `localBackend.*` codes and both
 * dictionaries carry a sentence for each of them; only a handful were reachable
 * through `CODE_TO_KEY`, so the rest reached the screen as
 * `Failed: localBackend.httpError`. `t()` returns the key itself for an unknown
 * one, so asking for the sentence *is* the existence check: a code with no
 * entry still falls through to the generic line instead of rendering empty.
 *
 * @param {unknown} code
 * @returns {string|undefined}
 */
function localBackendSentenceKey(code) {
  if (typeof code !== "string" || !code.startsWith("localBackend.")) {
    return undefined;
  }
  const sentence = t(code);
  return sentence && sentence !== code ? code : undefined;
}

/**
 * The code a failure resolves to after raw provider messages are promoted, and
 * the dictionary key that code owns (undefined when it owns none).
 *
 * Shared by `errorText` and `errorExplanation` so a code means exactly one
 * thing on every surface, rather than each caller re-deriving the promotion.
 *
 * @param {unknown} error
 * @returns {{ code: string|undefined, message: string|null, key: string|undefined }}
 */
function resolveError(error) {
  let code = typeof error === "string" ? error : error?.code;
  const message = typeof error === "object" ? error?.message : null;
  const providerId = typeof error === "object" ? error?.providerId : null;

  // Pattern matching on raw provider messages to promote generic error codes
  // into actionable, localized categories before dictionary lookup.
  if (message) {
    if (QUOTA_PATTERN.test(message)) {
      code = "providerQuota";
    } else if (MODERATION_PATTERN.test(message)) {
      code = "providerModerationBlocked";
    } else if (SERVER_BUSY_PATTERN.test(message) && code !== "providerQuota") {
      code = "providerServerBusy";
    } else if (MODEL_NOT_FOUND_PATTERN.test(message)) {
      code = "providerModelNotFound";
    } else if (CHANNEL_UNAVAILABLE_PATTERN.test(message)) {
      code = "providerChannelUnavailable";
    } else if (UPSTREAM_TIMEOUT_PATTERN.test(message)) {
      code = "providerUpstreamTimeout";
    }
  }

  const key =
    code === "localBackend.mediaUnsupported"
      ? // One code covers "this local model cannot serve this request": a 3D
        // route with no 3D backend, and an image edit on a generation-only
        // checkpoint. Its authored sentence names 3D, so the medium decides
        // which copy is right (`local_capabilities.js`).
        localUnsupportedMessageKey(error?.detail?.mediaType ?? error?.mediaType)
      : code === "providerNotConfigured" && providerId === PROVIDER_ID.DASHSCOPE
        ? "error.providerNotConfiguredDashScope"
        : (CODE_TO_KEY[code] ?? localBackendSentenceKey(code));
  return { code, message, key };
}

export function errorText(error, { timeoutMs } = {}) {
  if (!error) return "";
  const { code, message, key } = resolveError(error);
  let baseText = key
    ? t(key)
    : t("error.generic", { message: code || message || "error" });
  if (key === "error.timeout") {
    baseText = t(key, { seconds: Math.round((timeoutMs ?? 300000) / 1000) });
  }

  // Preserve non-empty original message so debugging diagnostics are retained,
  // while the prominent primary copy remains localized and actionable.
  if (
    message &&
    message !== code &&
    message !== baseText &&
    !baseText.includes(message)
  ) {
    return `${baseText}: ${message}`;
  }
  return baseText;
}

/**
 * What a failure MEANS, for a surface that is not the run banner: the agent's
 * run receipt and `list_nodes`.
 *
 * The engine records a node failure as `{ code, message }` and both default the
 * message to the code (`RunError` in engine/executor_errors.js, `apiError` in
 * engine/api_executor.js), so a failure reached the model as
 * `{"code":"unsupported-mp4","message":"unsupported-mp4"}` — a machine token
 * and nothing a model or the user could act on, because the agent path had no
 * table at all. This is that table: the same `CODE_TO_KEY` map and the same
 * provider-message promotion `errorText` already gives the UI, so the model and
 * the user are never told two different things about one failure.
 *
 * Two shapes:
 *
 *  - the authored sentence for the code, with any raw provider detail appended
 *    exactly as the banner shows it;
 *  - `""` — there is nothing to add, because the code owns no copy.
 *
 * `""` is not an oversight. The caller hands the model the failure's own
 * `{ code, message, details }` untouched, so for an uncovered code the model
 * already has the code named and whatever detail the failure carried; a second
 * copy of it under another key would be noise, and inventing prose for a code
 * this module does not know would be worse. Those codes are passed through raw
 * on purpose.
 *
 * @param {unknown} error
 * @returns {string} "" when there is no error, or no authored copy for one.
 */
export function errorExplanation(error) {
  if (!error) return "";
  const { key } = resolveError(error);
  return key ? errorText(error) : "";
}

/**
 * Copy shown in the mask/repaint panel for an error code.
 *
 * Kept separate from `errorText`'s general code map because the panel has its
 * own, deliberately different wording for the missing-API-key gap
 * (`editor.mask.needApiKey`), and that wording must stay as-is. Every other
 * code — including Repaint's `noRepaintRouteAvailable`, which is an actionable
 * configuration hint rather than a generic failure — falls through to
 * `errorText`, so a specific code resolves to its own copy instead of the
 * generic "background removal failed" line.
 */
export function maskErrorCopy(error) {
  if (error === "providerNotConfigured") return t("editor.mask.needApiKey");
  return errorText(error);
}

/** Human label for the fine-grained progress the content script reports. */
export function stageText(stage) {
  return stage ? t(`stage.${stage}`) : "";
}
