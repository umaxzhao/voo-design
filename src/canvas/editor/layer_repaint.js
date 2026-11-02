/**
 * Regenerating one layer without leaving the editor.
 *
 * The workflow route — wire an editor into a generation node, run, wire the
 * result back — is the right shape for producing something new. It is the
 * wrong shape for "make this bit different": arranging a document and then
 * leaving it to change one layer loses the arrangement that made the change
 * worth asking for.
 *
 * This sends the layer's own pixels and a description straight to the
 * configured provider and hands back a picture, which the caller drops in
 * where the old one was. The document, its other layers and the history all
 * stay put.
 */

import {
  fetchAssetDataUrl,
  fetchProviderJob,
  submitProviderJob,
} from "../provider_client.js";
import {
  API_MEDIA_TYPE,
  PROVIDER_ID,
  REMOTE_JOB_STATUS,
} from "../../shared/providers.js";
import {
  MODEL_ROUTE_ID,
  getPerformanceTier,
  isDegradableError,
  localRequestBudget,
  planFallbackChain,
} from "../../shared/model-routes.js";
import { PERFORMANCE_TIER } from "../../shared/performance-tier.js";
import { resolveCanvasModelRouteFallbackChain } from "../model_route_resolver.js";
import { supportsOpenAITransparentBackground } from "../../shared/providers/image-transparency.js";

/** How often a submitted job is asked about, in milliseconds. */
const POLL_INTERVAL_MS = 2000;

/** The engine's own alignment: 32 px, and never below one tile. */
const LOCAL_EDGE_ALIGNMENT_PX = 32;

function alignedLocalEdge(value) {
  const aligned =
    Math.round(value / LOCAL_EDGE_ALIGNMENT_PX) * LOCAL_EDGE_ALIGNMENT_PX;
  return aligned >= LOCAL_EDGE_ALIGNMENT_PX ? aligned : LOCAL_EDGE_ALIGNMENT_PX;
}

/**
 * The local request budget this candidate runs under, or null.
 *
 * The engine only answers to it, so a cloud candidate in the same chain is left
 * untouched. A injects nothing (defined as today's behaviour), while the middle
 * tier, an unmeasurable machine (§2.2 rule 7) and a low tier that the user
 * pinned to local all run through the middle tier's caps — the same mapping the
 * workflow request (`api_request.js`) and the editor's crop path use, with the
 * numbers owned by `localRequestBudget`.
 */
function localBudgetForCandidate(providerId) {
  if (providerId !== PROVIDER_ID.LOCAL) return null;
  const { tier } = getPerformanceTier();
  if (tier === PERFORMANCE_TIER.HIGH) return null;
  return localRequestBudget(PERFORMANCE_TIER.MID);
}

/**
 * The pixel size a PNG data URL declares, or null.
 *
 * Read from the IHDR header alone: this module talks to providers and never
 * decodes an image itself. The editor's own sources are PNG data URLs
 * (`exportNodePng`, `canvas.toDataURL("image/png")`), which is where the paths
 * below get their size from when the caller did not bring one.
 *
 * @param {unknown} dataUrl
 * @returns {{ width: number, height: number }|null}
 */
export function pngSizeFromDataUrl(dataUrl) {
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) return null;
  try {
    // 24 bytes are the signature plus IHDR's length, type, width and height.
    const header = globalThis.atob(
      dataUrl.slice(prefix.length, prefix.length + 32),
    );
    if (header.length < 24) return null;
    const isPng =
      header.charCodeAt(0) === 0x89 &&
      header.charCodeAt(1) === 0x50 &&
      header.charCodeAt(2) === 0x4e &&
      header.charCodeAt(3) === 0x47;
    if (!isPng) return null;
    const width =
      header.charCodeAt(16) * 0x1000000 +
      (header.charCodeAt(17) << 16) +
      (header.charCodeAt(18) << 8) +
      header.charCodeAt(19);
    const height =
      header.charCodeAt(20) * 0x1000000 +
      (header.charCodeAt(21) << 16) +
      (header.charCodeAt(22) << 8) +
      header.charCodeAt(23);
    if (!(width > 0) || !(height > 0)) return null;
    return { width, height };
  } catch {
    // No `atob` in this host, or a damaged data URL: the caller's own dims (or
    // the engine's default) still apply.
    return null;
  }
}

/**
 * The width/height a local candidate may be asked for under `maxEdgePx`.
 *
 * A size the caller brought is left alone when it already fits: the crop path
 * hands over a bitmap and the matching dims (they were downsampled together),
 * and re-aligning the request away from the picture it describes would be
 * wrong. A path that hands over pixels only (layer repaint, outpaint) gets a
 * size derived from the source's own aspect, fitted to the cap and snapped to
 * 32 px — the aspect is kept, so the smaller answer scales back onto the same
 * rect instead of being squeezed.
 *
 * @param {{
 *   width?: number,
 *   height?: number,
 *   dataUrl?: string,
 *   maxEdgePx?: number,
 * }} input
 * @returns {{ width: number, height: number }|null} null when nothing needs capping
 */
export function localBudgetRequestSize({ width, height, dataUrl, maxEdgePx }) {
  const cap = Number(maxEdgePx);
  if (!(cap > 0)) return null;
  const callerDims =
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? { width, height }
      : null;
  if (callerDims) {
    const longest = Math.max(callerDims.width, callerDims.height);
    if (longest <= cap) return null;
    const scale = cap / longest;
    return {
      width: alignedLocalEdge(callerDims.width * scale),
      height: alignedLocalEdge(callerDims.height * scale),
    };
  }
  const source = pngSizeFromDataUrl(dataUrl);
  if (!source) return null;
  const longest = Math.max(source.width, source.height);
  if (longest <= cap) return null;
  const scale = cap / longest;
  return {
    width: alignedLocalEdge(source.width * scale),
    height: alignedLocalEdge(source.height * scale),
  };
}

/** Default total budget for a cloud-only provider fallback chain (2 minutes). */
export const DEFAULT_REPAINT_TIMEOUT_MS = 120000;

/**
 * The wait ceiling a chain that contains the local engine may use, by tier.
 *
 * The factory two minutes was written for cloud jobs and is shorter than a real
 * local edit: the calibration run measured ~298 s at 512×512 with the model
 * loaded and ~340 s for a workflow generation (`docs/plan-performance-tier.md`
 * §1.3/§3.5). Local is the default route for the higher tiers, so leaving the
 * factory value in place means a user's first Repaint returns a timeout instead
 * of a picture. The ceiling stays finite — a busy editor must end — and only
 * bounds *waiting*: the candidate order, `onStatus({phase:"fallback"})` and the
 * `attemptedChain` diagnostics are untouched.
 */
export const LOCAL_WAIT_CEILING_MS = Object.freeze({
  [PERFORMANCE_TIER.HIGH]: 900000,
  [PERFORMANCE_TIER.MID]: 600000,
  [PERFORMANCE_TIER.LOW]: 600000,
  [PERFORMANCE_TIER.UNKNOWN]: 600000,
});

/**
 * The ceiling in force for a chain that runs locally.
 *
 * A, B and an unmeasurable machine all keep local as the default route; the low
 * tier only reaches local because the user pinned it, and that user's machine
 * still has to finish the edit it was asked for.
 */
function localWaitCeilingMs() {
  const { tier } = getPerformanceTier();
  return (
    LOCAL_WAIT_CEILING_MS[tier] ?? LOCAL_WAIT_CEILING_MS[PERFORMANCE_TIER.MID]
  );
}

/**
 * How much of the total budget is held back for a candidate after the first.
 *
 * The chain exists so a stopped local engine degrades to a configured cloud
 * provider, and that only works if the later candidate still has time when it
 * is reached: a first candidate that spends the whole budget (a cold model
 * load, a gateway that never answers) would otherwise leave the fallback with
 * nothing and turn the chain into a bare terminal timeout — the exact outcome
 * the fallback is there to prevent. It is one bounded slice, never a second
 * full budget: a chain that cannot succeed still ends within its own time plus
 * at most this slice, and a single-candidate chain is unaffected.
 */
export const FALLBACK_RESERVE_MS = 15000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * An error carrying a code the editor's error_text can localise.
 */
export function repaintError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

/**
 * Determines whether a failure on one provider is eligible to fall back to the
 * next candidate provider in the chain.
 *
 * @param {any} error
 * @param {{ hasTaskId?: boolean }} [context]
 * @returns {boolean}
 */
export function isRepaintFallbackEligibleError(error, context = {}) {
  return isDegradableError(error, context);
}

/**
 * Follows a submitted job to a terminal state within the shared timeout budget.
 */
async function waitForRepaint({
  providerId,
  taskId,
  deadline,
  shouldStop,
  onStatus,
}) {
  for (;;) {
    if (shouldStop?.()) throw repaintError("stopped");
    if (deadline && Date.now() >= deadline) {
      throw repaintError("timeout");
    }

    let result;
    try {
      result = await fetchProviderJob({
        providerId,
        mediaType: API_MEDIA_TYPE.IMAGE,
        taskId,
      });
    } catch (error) {
      // A slow gateway says nothing about the remote task; keep the id and
      // retry rather than turning a running job into a failure.
      if (
        error?.code === "providerTimeout" ||
        error?.code === "providerNetworkError"
      ) {
        onStatus?.({ phase: "processing", providerId });
        const waitMs = deadline
          ? Math.min(POLL_INTERVAL_MS, Math.max(100, deadline - Date.now()))
          : POLL_INTERVAL_MS;
        await delay(waitMs);
        continue;
      }
      throw error;
    }

    if (result.status === REMOTE_JOB_STATUS.COMPLETED) return result;
    if (result.status === REMOTE_JOB_STATUS.FAILED) {
      throw repaintError("providerJobFailed", result.errorMessage);
    }
    onStatus?.({ phase: "processing", providerId });
    const waitMs = deadline
      ? Math.min(POLL_INTERVAL_MS, Math.max(100, deadline - Date.now()))
      : POLL_INTERVAL_MS;
    await delay(waitMs);
  }
}

/**
 * Runs a single repaint attempt on one specific candidate provider.
 */
async function attemptRepaintSingle({
  dataUrl,
  maskDataUrl,
  width,
  height,
  instruction,
  candidate,
  deadline,
  shouldStop,
  onStatus,
  transparentBackground,
}) {
  onStatus?.({
    phase: "submitting",
    providerId: candidate.providerId,
    modelId: candidate.modelId,
  });

  // The middle tier's caps apply to the request that reaches the local engine,
  // and only that one (contract §3.2): the size is fitted to the cap with the
  // source's own aspect (a path that brought its own matching dims keeps them),
  // and the sampling steps are capped. The reply is composited back onto the
  // same rect, so geometry does not move — only the working resolution does.
  const budget = localBudgetForCandidate(candidate.providerId);
  const requestSize = budget
    ? localBudgetRequestSize({
        width,
        height,
        dataUrl,
        maxEdgePx: budget.maxEdgePx,
      })
    : null;

  const submitted = await submitProviderJob({
    providerId: candidate.providerId,
    mediaType: API_MEDIA_TYPE.IMAGE,
    request: {
      model: candidate.modelId,
      prompt: instruction,
      // The layer itself is the reference: this is an edit of a specific
      // picture, not a fresh generation that happens to resemble it.
      image: dataUrl,
      mask: maskDataUrl,
      width: requestSize?.width ?? width,
      height: requestSize?.height ?? height,
      ...(budget ? { steps: budget.maxSteps } : {}),
      n: 1,
      ...(transparentBackground &&
      candidate.providerId === PROVIDER_ID.AI_302 &&
      supportsOpenAITransparentBackground(candidate.modelId)
        ? { background: "transparent", output_format: "png" }
        : {}),
    },
  });

  if (!submitted?.taskId) throw repaintError("providerRequestFailed");
  let finished;
  try {
    finished = await waitForRepaint({
      providerId: candidate.providerId,
      taskId: submitted.taskId,
      deadline,
      shouldStop,
      onStatus,
    });
  } catch (err) {
    if (err && typeof err === "object") {
      err.taskId = submitted.taskId;
      err.hasTaskId = true;
    }
    throw err;
  }

  // fetchProviderJob normalises every provider's answer to a list of urls.
  const url = finished.urls?.[0];
  if (!url) throw repaintError("providerNoResult");
  onStatus?.({ phase: "downloading", providerId: candidate.providerId });

  // Some providers answer inline; those need no second round trip.
  if (url.startsWith("data:")) return url;
  const { dataUrl: fetched } = await fetchAssetDataUrl({ url });
  if (!fetched) throw repaintError("providerNoResult");
  return fetched;
}

/**
 * Repaints one layer with runtime fallback across candidate providers.
 *
 * Tries the candidates in resolved priority order (e.g. Local -> DashScope -> 302.AI).
 * If a candidate fails with a fallback-eligible error, automatically falls back
 * to the next candidate within a shared total time budget.
 *
 * @param {{
 *   dataUrl: string,
 *   maskDataUrl?: string,
 *   width?: number,
 *   height?: number,
 *   prompt: string,
 *   providerId?: string,
 *   modelId?: string,
 *   providers?: Array<{ providerId: string, modelId?: string }>,
 *   routeId?: string,
 *   timeoutMs?: number,
 *   shouldStop?: () => boolean,
 *   onStatus?: (state: {
 *     phase: string,
 *     from?: string,
 *     to?: string,
 *     providerId?: string,
 *     modelId?: string,
 *     previousProviderId?: string,
 *     reason?: string,
 *   }) => void,
 * }} request
 * @returns {Promise<string>} the replacement picture data URL.
 */
export async function repaintLayer({
  dataUrl,
  maskDataUrl,
  width,
  height,
  prompt,
  providerId,
  modelId,
  providers,
  routeId = MODEL_ROUTE_ID.REPAINT,
  timeoutMs,
  shouldStop,
  onStatus,
  transparentBackground = false,
}) {
  const instruction = prompt?.trim();
  if (!instruction) throw repaintError("emptyPrompt");
  if (!dataUrl) throw repaintError("bitmapMissing");

  // Determine candidate fallback chain using planFallbackChain
  let chain = [];
  if (Array.isArray(providers) && providers.length > 0) {
    chain = planFallbackChain(providers, {
      lockedProviderId: providerId,
    });
  } else if (providerId) {
    // User explicitly locked providerId: chain length is 1 (no fallback)
    chain = planFallbackChain([{ providerId, modelId }], {
      lockedProviderId: providerId,
    });
  } else {
    try {
      // One resolver owns the whole rule, including whether the route holds a
      // deliberate choice (which locks) or only the built-in default (which
      // does not, so the chain may degrade past a stopped local engine).
      chain = await resolveCanvasModelRouteFallbackChain(routeId);
    } catch {
      chain = [];
    }
  }

  if (chain.length === 0) {
    throw repaintError("providerNotConfigured");
  }

  // An explicit caller budget (tests, a caller with a deadline of its own) is
  // used exactly as asked. The *default* is what the tier decides, and only a
  // chain that actually runs locally gets the raised ceiling (§3.5): a
  // cloud-only chain keeps the factory two minutes, so nothing that never
  // touches the engine waits any longer than it did before.
  const localInChain = chain.some(
    (candidate) => candidate?.providerId === PROVIDER_ID.LOCAL,
  );
  const chainBudgetMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : localInChain
        ? localWaitCeilingMs()
        : DEFAULT_REPAINT_TIMEOUT_MS;

  const hasBudget = Number.isFinite(chainBudgetMs) && chainBudgetMs > 0;
  const deadline = hasBudget ? Date.now() + chainBudgetMs : null;
  // Released once, and only when the shared budget is gone and a later
  // candidate is actually reached, so the ordinary path never gains time.
  let reserveMs = hasBudget
    ? Math.min(FALLBACK_RESERVE_MS, Math.floor(chainBudgetMs / 2))
    : 0;
  let reserveReleased = false;
  /**
   * The deadline actually in force for the current candidate: the shared one
   * while it lasts, then the released reserve. The post-failure accounting
   * reads this, not the original deadline, or a candidate that fails *early*
   * inside the released slice would still be treated as "out of time" and end
   * the chain with candidates left untried.
   */
  let effectiveDeadline = deadline;

  /**
   * The deadline for the candidate about to be tried.
   *
   * The budget in force while it lasts; then the reserved slice, once; then
   * `exhausted`, and the caller reports the chain's own timeout.
   */
  const takeBudget = () => {
    if (!hasBudget) return { deadline: null, exhausted: false };
    if (Date.now() < effectiveDeadline) {
      return { deadline: effectiveDeadline, exhausted: false };
    }
    if (reserveMs > 0 && !reserveReleased) {
      reserveReleased = true;
      effectiveDeadline = Date.now() + reserveMs;
      reserveMs = 0;
      return { deadline: effectiveDeadline, exhausted: false };
    }
    return { deadline: effectiveDeadline, exhausted: true };
  };

  let lastError = null;

  for (let i = 0; i < chain.length; i += 1) {
    const candidate = chain[i];
    if (shouldStop?.()) throw repaintError("stopped");

    const budget = takeBudget();
    if (budget.exhausted) throw repaintError("timeout", lastError);

    if (i > 0) {
      const prev = chain[i - 1];
      onStatus?.({
        phase: "fallback",
        from: prev.providerId,
        to: candidate.providerId,
        previousProviderId: prev.providerId,
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        reason: lastError?.code || lastError?.message,
      });
    }

    try {
      return await attemptRepaintSingle({
        dataUrl,
        maskDataUrl,
        width,
        height,
        instruction,
        candidate,
        deadline: budget.deadline,
        shouldStop,
        onStatus,
        transparentBackground,
      });
    } catch (error) {
      lastError = error;
      if (shouldStop?.() || !isRepaintFallbackEligibleError(error)) {
        if (error && typeof error === "object") {
          error.attemptedChain = chain.slice(0, i + 1);
        }
        throw error;
      }
      // A candidate that ran the clock out must not end the chain while a
      // candidate after it is still untried: the reserved slice is what pays
      // for that turn (see FALLBACK_RESERVE_MS). "Out of time" means the
      // budget actually in force for this candidate — the released slice still
      // has room for the candidates behind it when it failed early.
      const candidatesLeft = chain.length - 1 - i;
      const withinBudget = !hasBudget || Date.now() < effectiveDeadline;
      if (candidatesLeft > 0 && (withinBudget || reserveMs > 0)) {
        continue;
      }
      if (hasBudget && !withinBudget && reserveMs <= 0) {
        throw repaintError("timeout", lastError);
      }
      if (error && typeof error === "object") {
        error.attemptedChain = chain.slice(0, i + 1);
      }
      throw error;
    }
  }

  if (lastError && typeof lastError === "object") {
    lastError.attemptedChain = chain.slice(0, chain.length);
  }
  if (hasBudget && Date.now() >= deadline) {
    throw repaintError("timeout", lastError);
  }
  throw lastError || repaintError("providerRequestFailed");
}
