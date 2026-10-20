/**
 * Visual artifact verification hook (Package B).
 *
 * Reuses existing multimodal entrypoints, respects user settings, and safely falls back
 * to unverifiable when images, vision models, or budget are unavailable.
 *
 * Pure module: NO React imports.
 *
 * @module agent-panel/verify-visual-artifact
 */

import { visionModelFor } from "../../../shared/providers.js";
import { describeImage } from "./visionLocate.js";
import {
  VERIFICATION_STATUS,
  CHECK_CATEGORY,
  createVerificationEvidence,
  computeVerificationOutcome,
} from "./verification-evidence.js";

/**
 * Visual artifact verification hook.
 *
 * @param {Object} args
 * @param {Object} result
 * @param {Function} observe
 * @param {Object} [context]
 * @returns {Promise<{ ok: boolean, canContinue: boolean, verified: boolean, status: string, issues: Array<Object> }>}
 */
export async function verifyVisualArtifact(
  args,
  result,
  observe,
  context = {},
) {
  // Check if visual review was explicitly requested
  const isRequested = Boolean(
    args?.visualReview ||
    context?.visualReview ||
    context?.reviewStrategy === "visual" ||
    context?.reviewStrategy === "full",
  );

  if (!isRequested) {
    return {
      ok: true,
      canContinue: true,
      verified: false,
      status: VERIFICATION_STATUS.UNVERIFIED,
      issues: [],
    };
  }

  const targetId = args?.targetNodeId || result?.nodeId || "canvas";
  const sourceVersion = context?.sourceVersion || args?.sourceVersion || null;

  // 1. Resolve image source
  let dataUrl = args?.dataUrl || result?.dataUrl || context?.dataUrl;
  if (!dataUrl) {
    const store = context?.getStore ? context.getStore() : context?.store;
    if (typeof store?.runEditorCommand === "function") {
      try {
        const exported = await store.runEditorCommand({
          tool: "export_canvas_png",
          args: { maxEdge: 768 },
        });
        dataUrl = exported?.dataUrl;
      } catch {
        // Fallback
      }
    }
  }

  if (!dataUrl && typeof observe === "function") {
    try {
      const obs = await observe({ scope: "viewport" });
      dataUrl = obs?.thumbnail || obs?.screenshot || obs?.pixels?.dataUrl;
    } catch {
      // Fallback
    }
  }

  if (!dataUrl) {
    const unverifiableIssue = createVerificationEvidence({
      id: "verify_visual_no_image",
      category: CHECK_CATEGORY.VISUAL_FACT,
      targetType: "canvas",
      targetId,
      checkType: "visual_image_available",
      severity: "warning",
      verdict: VERIFICATION_STATUS.UNVERIFIABLE,
      reason:
        "Visual recheck requested, but raster image or canvas snapshot is unavailable.",
      suggestion:
        "Ensure canvas has renderable pixels or export_canvas_png is supported before visual review.",
      sourceVersion,
    });
    return {
      ok: false,
      canContinue: true,
      verified: false,
      status: VERIFICATION_STATUS.UNVERIFIABLE,
      issues: [unverifiableIssue],
    };
  }

  // 2. Resolve vision inspector or multimodal model configuration
  const visualInspector = context?.visualInspector;
  const llm = context?.llm ?? {};
  const model =
    context?.visionModel || visionModelFor(llm.providerId, llm.model);

  if (!visualInspector && (!model || !llm.apiKey)) {
    const unverifiableIssue = createVerificationEvidence({
      id: "verify_visual_no_vision_model",
      category: CHECK_CATEGORY.VISUAL_FACT,
      targetType: "canvas",
      targetId,
      checkType: "vision_model_available",
      severity: "warning",
      verdict: VERIFICATION_STATUS.UNVERIFIABLE,
      reason:
        "Visual recheck requested, but no vision model or API key is configured.",
      suggestion:
        "Configure a vision model in settings or enable multimodal review on VOO Cloud.",
      sourceVersion,
    });
    return {
      ok: false,
      canContinue: true,
      verified: false,
      status: VERIFICATION_STATUS.UNVERIFIABLE,
      issues: [unverifiableIssue],
    };
  }

  // 3. Resolve budget
  if (context?.budgetExceeded || context?.creditsAvailable === false) {
    const unverifiableIssue = createVerificationEvidence({
      id: "verify_visual_budget_exhausted",
      category: CHECK_CATEGORY.VISUAL_FACT,
      targetType: "canvas",
      targetId,
      checkType: "visual_budget_available",
      severity: "warning",
      verdict: VERIFICATION_STATUS.UNVERIFIABLE,
      reason:
        "Visual recheck requested, but visual verification quota or credit budget is exhausted.",
      suggestion: "Recharge credits or proceed without visual recheck.",
      sourceVersion,
    });
    return {
      ok: false,
      canContinue: true,
      verified: false,
      status: VERIFICATION_STATUS.UNVERIFIABLE,
      issues: [unverifiableIssue],
    };
  }

  // 4. Perform visual check
  try {
    if (typeof visualInspector === "function") {
      const inspectionResult = await visualInspector({
        dataUrl,
        args,
        result,
        context,
      });
      return computeVerificationOutcome(inspectionResult?.issues || [], {
        unverifiable:
          inspectionResult?.status === VERIFICATION_STATUS.UNVERIFIABLE,
        needsHumanJudgment:
          inspectionResult?.status === VERIFICATION_STATUS.NEEDS_HUMAN_JUDGMENT,
      });
    }

    const question =
      args?.question ||
      "Check this generated visual artifact for noticeable defects, corruptions, artifacts, or layout seams. State any concrete defect found.";

    const observation = await describeImage({
      question,
      dataUrl,
      apiKey: llm.apiKey,
      model,
      baseUrl: llm.baseUrl,
      signal: context?.signal,
    });

    const isDefective =
      /broken|defect|corrupt|artifact|seam|overlap error/i.test(observation);
    if (isDefective) {
      const defectIssue = createVerificationEvidence({
        id: `verify_visual_defect_${targetId}`,
        category: CHECK_CATEGORY.VISUAL_FACT,
        targetType: "canvas",
        targetId,
        checkType: "visual_artifact_defect",
        severity: "error",
        verdict: VERIFICATION_STATUS.FAILED,
        reason: observation,
        suggestion:
          "Refine or regenerate the defective area with focused inpainting.",
        sourceVersion,
      });
      return {
        ok: false,
        canContinue: false,
        verified: false,
        status: VERIFICATION_STATUS.FAILED,
        issues: [defectIssue],
      };
    }

    return {
      ok: true,
      canContinue: true,
      verified: true,
      status: VERIFICATION_STATUS.VERIFIED,
      issues: [],
    };
  } catch (err) {
    const errorIssue = createVerificationEvidence({
      id: `verify_visual_runtime_error_${targetId}`,
      category: CHECK_CATEGORY.VISUAL_FACT,
      targetType: "canvas",
      targetId,
      checkType: "visual_verifier_runtime",
      severity: "warning",
      verdict: VERIFICATION_STATUS.UNVERIFIABLE,
      reason: `Visual recheck failed with error: ${err?.message || err}`,
      sourceVersion,
    });
    return {
      ok: false,
      canContinue: true,
      verified: false,
      status: VERIFICATION_STATUS.UNVERIFIABLE,
      issues: [errorIssue],
    };
  }
}
