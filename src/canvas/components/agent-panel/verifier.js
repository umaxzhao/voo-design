/**
 * Multi-modal Completion Verifier (P0-8 / Package B).
 *
 * Implements deterministic and visual verification gates for agent tool executions:
 * - `generate_layout`: verified against critique_design deterministic rules (0 error issues)
 * - `create_node`: verified that node exists and matches declared type/parameters
 * - `repaint_selection` / `fill_selection`: verified that pixels outside target region remain untouched
 * - `verifyVisualArtifact`: visual artifact inspection hook (honors multimodal settings & fallback)
 *
 * Pure module: NO React imports (CLAUDE.md §2).
 * Maximum retry constant: MAX_VERIFY_RETRIES = 2.
 * 4-state contract: "verified" | "failed" | "unverifiable" | "needs_human_judgment" (+ "unverified").
 *
 * @module agent-panel/verifier
 */

import {
  evaluateDeterministicRules,
  resolveDocument,
} from "./tools/critiqueDesign.js";
import { rollbackChangeSet } from "./changesetReview.js";
import { computeOutsideRegionHash, normalizeRegion } from "./observer.js";
import {
  VERIFICATION_STATUS,
  CHECK_CATEGORY,
  createVerificationEvidence,
  computeVerificationOutcome,
  normalizeVerificationIssue,
} from "./verification-evidence.js";

export {
  VERIFICATION_STATUS,
  CHECK_CATEGORY,
  createVerificationEvidence,
  computeVerificationOutcome,
  normalizeVerificationIssue,
} from "./verification-evidence.js";
export { verifyVisualArtifact } from "./verify-visual-artifact.js";
export { verifyCreateNode } from "./verify-created-node.js";

/** Maximum verification retry attempts per tool turn before failing the step. */
export const MAX_VERIFY_RETRIES = 2;

/**
 * Verifies generate_layout outcomes against critique_design's deterministic rules.
 * Passing criteria: zero issues with severity === "error".
 */
export async function verifyGenerateLayout(
  args,
  result,
  observe,
  context = {},
) {
  let doc = resolveDocument(args, context);
  if (!doc) {
    const store = context?.getStore ? context.getStore() : context?.store;
    if (typeof store?.getDocument === "function") {
      doc = store.getDocument();
    }
  }

  // If document cannot be resolved directly from store/args, query observer
  if (!doc && typeof observe === "function") {
    try {
      const obs = await observe({ scope: "viewport" });
      if (obs && obs.objects) {
        doc = {
          width: obs.bounds?.width || 1920,
          height: obs.bounds?.height || 1080,
          nodes: obs.objects,
          targetSpecs: args?.targetSpecs,
          safeMargin: args?.safeMargin,
        };
      }
    } catch {
      // Fallback
    }
  }

  const docVersion =
    doc?.version ?? doc?._version ?? context?.documentVersion ?? null;

  if (!doc) {
    const issue = createVerificationEvidence({
      id: "verify_layout_no_doc",
      category: CHECK_CATEGORY.SPEC,
      targetType: "document",
      targetId: "document",
      checkType: "document_presence",
      severity: "error",
      verdict: VERIFICATION_STATUS.FAILED,
      reason:
        "Layout generation completed but no design document could be located on canvas.",
      suggestion:
        "Ensure the generated layout is committed to the active editor document.",
      sourceVersion: docVersion,
    });
    return {
      ok: false,
      canContinue: false,
      verified: false,
      status: VERIFICATION_STATUS.FAILED,
      issues: [issue],
      allIssues: [issue],
      sourceVersion: docVersion,
    };
  }

  const rawIssues = evaluateDeterministicRules(doc, args);
  const standardizedIssues = rawIssues.map((issue) =>
    normalizeVerificationIssue(issue, {
      sourceVersion: docVersion,
      category: CHECK_CATEGORY.SPEC,
    }),
  );

  const errorIssues = standardizedIssues.filter(
    (issue) => issue.severity === "error",
  );
  const outcome = computeVerificationOutcome(standardizedIssues);

  return {
    ok: errorIssues.length === 0,
    canContinue: outcome.canContinue,
    verified: errorIssues.length === 0,
    status:
      errorIssues.length === 0
        ? VERIFICATION_STATUS.VERIFIED
        : VERIFICATION_STATUS.FAILED,
    issues: errorIssues,
    allIssues: standardizedIssues,
    sourceVersion: docVersion,
  };
}

/**
 * Verifies regional / inpaint / repaint tools: asserts that pixels outside target selection remain untouched.
 */
export async function verifyRegionalPixels(
  args,
  result,
  observe,
  context = {},
) {
  const issues = [];
  const region = normalizeRegion(
    args?.region ||
      args?.selection ||
      args?.box ||
      result?.region ||
      context?.preExecutionState?.selectionRegion ||
      context?.selectionRegion,
  );

  const beforeHash =
    context?.preExecutionState?.outsidePixelHash ??
    context?.beforeHash ??
    result?.beforeHash;

  // Resolve current pixel source
  const store = context?.getStore ? context.getStore() : context?.store;
  let currentPixels =
    context?.currentPixels ??
    (typeof context?.getCanvasPixels === "function"
      ? context.getCanvasPixels(region)
      : null) ??
    (typeof store?.getCanvasPixels === "function"
      ? store.getCanvasPixels(region)
      : null) ??
    context?.afterPixels;

  if (!currentPixels && typeof observe === "function") {
    try {
      const obs = await observe({ scope: "viewport" });
      currentPixels = obs?.pixels || obs?.screenshot;
    } catch {
      // ignore
    }
  }

  const afterHash = currentPixels
    ? computeOutsideRegionHash(currentPixels, region)
    : (context?.afterHash ?? result?.afterHash);

  // If pixels are unavailable, or beforeHash/afterHash could not be resolved:
  if (currentPixels?.unavailable || !beforeHash || !afterHash) {
    const unavailableReason =
      currentPixels?.reason ||
      (currentPixels?.unavailable ? "Canvas pixels unavailable" : null) ||
      (!beforeHash
        ? "Pre-execution pixel baseline hash could not be captured"
        : null) ||
      (!afterHash ? "Post-execution pixel hash could not be computed" : null) ||
      "Canvas pixel reading or outside region hash is unavailable in this environment.";

    const unverifiableIssue = createVerificationEvidence({
      id: "verify_pixels_unverifiable",
      category: CHECK_CATEGORY.VISUAL_FACT,
      targetType: "pixels",
      targetId: "outside_selection",
      region,
      checkType: "pixel_verification_available",
      severity: "warning",
      verdict: VERIFICATION_STATUS.UNVERIFIABLE,
      reason: unavailableReason,
      suggestion:
        "Manual review required: changes completed but regional pixel isolation could not be automatically verified.",
      sourceVersion: context?.sourceVersion || null,
    });

    return {
      ok: false,
      canContinue: true,
      verified: false,
      status: VERIFICATION_STATUS.UNVERIFIABLE,
      issues: [unverifiableIssue],
    };
  }

  if (beforeHash !== afterHash) {
    let rolledBack = false;

    // Trigger out-of-bounds rollback if ChangeSet undoData is available
    if (context?.undoData && store) {
      try {
        const rbResult = rollbackChangeSet(store, {
          undoData: context.undoData,
        });
        rolledBack = Boolean(rbResult?.success);
      } catch (err) {
        console.warn(
          "[Verifier] Automatic out-of-bounds rollback failed:",
          err,
        );
      }
    }

    const failedIssue = createVerificationEvidence({
      id: "verify_unaffected_pixels_mutated",
      category: CHECK_CATEGORY.VISUAL_FACT,
      targetType: "pixels",
      targetId: "outside_selection",
      region,
      checkType: "unaffected_pixels_preserved",
      severity: "error",
      verdict: VERIFICATION_STATUS.FAILED,
      reason: `Pixels outside selection region (${region.x}, ${region.y}, ${region.width}x${region.height}) were mutated (hash: ${beforeHash} -> ${afterHash}).`,
      suggestion:
        "Constrain pixel manipulation strictly inside the designated selection boundary.",
      sourceVersion: context?.sourceVersion || null,
    });
    if (rolledBack) failedIssue.rolledBack = true;

    issues.push(failedIssue);

    return {
      ok: false,
      canContinue: false,
      verified: false,
      status: VERIFICATION_STATUS.FAILED,
      issues,
      rolledBack,
    };
  }

  return {
    ok: true,
    canContinue: true,
    verified: true,
    status: VERIFICATION_STATUS.VERIFIED,
    issues: [],
  };
}

/**
 * Captures pre-execution state needed for boundary verification before tool dispatch.
 */
export async function capturePreExecutionState(toolName, args, context) {
  if (
    toolName === "repaint_selection" ||
    toolName === "fill_selection" ||
    toolName === "refine_selection"
  ) {
    const store = context?.getStore ? context.getStore() : context?.store;
    const region = normalizeRegion(
      args?.region || args?.box || args?.selection,
    );
    let outsidePixelHash = null;

    let pixelSource = context?.currentPixels;
    if (!pixelSource && typeof context?.getCanvasPixels === "function") {
      pixelSource = context.getCanvasPixels(region);
    }
    if (!pixelSource && typeof store?.getCanvasPixels === "function") {
      pixelSource = store.getCanvasPixels(region);
    }

    if (pixelSource && !pixelSource.unavailable) {
      outsidePixelHash = computeOutsideRegionHash(pixelSource, region);
    }

    return {
      toolName,
      selectionRegion: region,
      outsidePixelHash,
      timestamp: Date.now(),
    };
  }

  return null;
}

/**
 * Runs verification for a completed tool call if the tool declared capabilities.verify.
 */
export async function runVerifier({
  toolName,
  args,
  result,
  context,
  registry,
  retryCount = 0,
}) {
  const capabilities = registry?.getCapabilities?.(toolName);
  const verifyFn = capabilities?.verify;

  if (typeof verifyFn !== "function") {
    return {
      verified: false,
      ok: true,
      canContinue: true,
      status: VERIFICATION_STATUS.UNVERIFIED,
      issues: [],
      retryCount,
    };
  }

  const observe = (options) => {
    if (typeof context?.observe === "function") {
      return context.observe(options);
    }
    return context?.observer ? context.observer(options, context) : null;
  };

  try {
    const verification = await verifyFn(args, result, observe, context);
    const issues = verification?.issues || [];
    const status =
      verification?.status ||
      (verification?.ok
        ? VERIFICATION_STATUS.VERIFIED
        : VERIFICATION_STATUS.FAILED);
    const canContinue =
      verification?.canContinue ?? status !== VERIFICATION_STATUS.FAILED;

    return {
      verified: true,
      ok: Boolean(verification?.ok),
      canContinue,
      status,
      issues,
      rolledBack: Boolean(verification?.rolledBack),
      retryCount,
      sourceVersion: verification?.sourceVersion,
    };
  } catch (err) {
    const errorIssue = createVerificationEvidence({
      id: `verify_exception_${toolName}`,
      category: CHECK_CATEGORY.SPEC,
      checkType: "verifier_runtime",
      severity: "error",
      verdict: VERIFICATION_STATUS.FAILED,
      reason: `Verifier threw error: ${err?.message || err}`,
    });
    return {
      verified: false,
      ok: false,
      canContinue: false,
      status: VERIFICATION_STATUS.FAILED,
      issues: [errorIssue],
      retryCount,
    };
  }
}
