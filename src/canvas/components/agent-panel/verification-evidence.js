/**
 * Unified Verification Evidence and Contract Model (Package B).
 *
 * Provides a standardized 4-state contract for artifact and design verification:
 * - "verified": passed all deterministic and visual criteria
 * - "failed": hard error or constraint violation
 * - "unverifiable": cannot verify due to missing pixels, vision model, or budget
 * - "needs_human_judgment": subjective or aesthetic review needing user input
 * Backward compatible with "unverified" for tools without verifier.
 *
 * Pure module: NO React imports.
 *
 * @module agent-panel/verification-evidence
 */

/**
 * Standard verification status enumeration.
 */
export const VERIFICATION_STATUS = Object.freeze({
  VERIFIED: "verified",
  FAILED: "failed",
  UNVERIFIABLE: "unverifiable",
  NEEDS_HUMAN_JUDGMENT: "needs_human_judgment",
  UNVERIFIED: "unverified",
});

/**
 * Categorization of verification checks.
 */
export const CHECK_CATEGORY = Object.freeze({
  SPEC: "spec",
  VISUAL_FACT: "visual_fact",
  AESTHETIC: "aesthetic",
});

/**
 * Normalizes an optional region object into { x, y, width, height }.
 * Returns null if region cannot be resolved.
 *
 * @param {Object} [region]
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
export function normalizeEvidenceRegion(region) {
  if (!region || typeof region !== "object") return null;
  const x = Number(region.x ?? region.left ?? 0);
  const y = Number(region.y ?? region.top ?? 0);
  const width = Number(region.width ?? region.w ?? 0);
  const height = Number(region.height ?? region.h ?? 0);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  if (region.w != null && region.width == null) {
    return { x, y, w: width, h: height };
  }
  return { x, y, width, height };
}

/**
 * Constructs a standardized verification evidence item.
 * Omits or nulls targetId/region/sourceVersion if not genuinely available.
 *
 * @param {Object} params
 * @param {string} params.id
 * @param {string} [params.category="spec"]
 * @param {string|null} [params.targetId=null]
 * @param {string} [params.targetType="node"]
 * @param {Object|null} [params.region=null]
 * @param {string|number|null} [params.sourceVersion=null]
 * @param {string} params.checkType
 * @param {string} [params.rule]
 * @param {string} [params.severity="error"] - "error" | "warning" | "info"
 * @param {string} [params.verdict]
 * @param {string} params.reason
 * @param {string|null} [params.suggestion=null]
 * @param {Object|string|null} [params.visualEvidence=null]
 * @returns {Object}
 */
export function createVerificationEvidence({
  id,
  category = CHECK_CATEGORY.SPEC,
  targetId = null,
  targetType = "node",
  region = null,
  sourceVersion = null,
  checkType,
  rule = null,
  severity = "error",
  verdict = null,
  reason,
  suggestion = null,
  visualEvidence = null,
  ...rest
}) {
  const normRegion = normalizeEvidenceRegion(region);
  const assignedVerdict =
    verdict ||
    (severity === "error"
      ? VERIFICATION_STATUS.FAILED
      : severity === "warning" && category === CHECK_CATEGORY.AESTHETIC
        ? VERIFICATION_STATUS.NEEDS_HUMAN_JUDGMENT
        : "passed");

  const resolvedRule = String(rule || checkType || "unknown");

  return {
    ...rest,
    id: String(id || `evidence_${Date.now()}`),
    category,
    targetId: targetId != null ? String(targetId) : null,
    targetType: String(targetType || "node"),
    ...(normRegion ? { region: normRegion } : {}),
    ...(sourceVersion != null ? { sourceVersion } : {}),
    checkType: String(checkType || resolvedRule),
    rule: resolvedRule,
    severity,
    verdict: assignedVerdict,
    reason: String(reason || ""),
    evidence: String(reason || ""), // compatibility with legacy evidence field
    ...(suggestion ? { suggestion: String(suggestion) } : {}),
    ...(visualEvidence ? { visualEvidence } : {}),
  };
}

/**
 * Normalizes a raw issue (from critique rules, verifier, or observer) into standardized evidence.
 *
 * @param {Object} raw
 * @param {Object} [defaults]
 * @returns {Object}
 */
export function normalizeVerificationIssue(raw, defaults = {}) {
  if (!raw || typeof raw !== "object") return null;

  const category =
    raw.category ||
    defaults.category ||
    (raw.rule?.includes("aesthetic") || raw.checkType?.includes("aesthetic")
      ? CHECK_CATEGORY.AESTHETIC
      : raw.rule?.includes("pixel") ||
          raw.targetType === "pixels" ||
          raw.visualEvidence
        ? CHECK_CATEGORY.VISUAL_FACT
        : CHECK_CATEGORY.SPEC);

  const checkType =
    raw.checkType || raw.rule || defaults.checkType || "spec_validation";
  const rule = raw.rule || raw.checkType || defaults.rule || checkType;
  const reason = raw.reason || raw.evidence || raw.message || "";
  const severity = raw.severity || defaults.severity || "error";
  const sourceVersion = raw.sourceVersion ?? defaults.sourceVersion ?? null;

  return createVerificationEvidence({
    ...raw,
    id: raw.id || defaults.id,
    category,
    targetId: raw.targetId ?? defaults.targetId ?? null,
    targetType: raw.targetType ?? defaults.targetType ?? "node",
    region: raw.region ?? defaults.region ?? null,
    sourceVersion,
    checkType,
    rule,
    severity,
    verdict: raw.verdict,
    reason,
    suggestion: raw.suggestion ?? defaults.suggestion ?? null,
    visualEvidence: raw.visualEvidence ?? null,
  });
}

/**
 * Computes unified outcome from a list of standardized verification issues.
 *
 * Contract:
 * - "failed": any severity === "error" (ok: false, canContinue: false, verified: false)
 * - "unverifiable": missing pixels/model/budget without error (ok: false, canContinue: true, verified: false)
 * - "needs_human_judgment": aesthetic or subjective warnings without error (ok: false, canContinue: true, verified: false)
 * - "verified": zero errors, zero unverifiable, zero human judgment required (ok: true, canContinue: true, verified: true)
 *
 * @param {Array<Object>} issues
 * @param {Object} [options]
 * @returns {{ ok: boolean, canContinue: boolean, verified: boolean, status: string, issues: Array<Object> }}
 */
export function computeVerificationOutcome(issues = [], options = {}) {
  const normIssues = issues
    .map((i) => normalizeVerificationIssue(i))
    .filter(Boolean);

  // 1. Hard deterministic or visual errors take absolute precedence
  const errorIssues = normIssues.filter((i) => i.severity === "error");
  if (errorIssues.length > 0) {
    return {
      ok: false,
      canContinue: false,
      verified: false,
      status: VERIFICATION_STATUS.FAILED,
      issues: normIssues,
    };
  }

  // 2. Unverifiable condition (missing image/pixels, missing vision model, or explicit unverifiable)
  const hasUnverifiable =
    options.unverifiable ||
    normIssues.some(
      (i) =>
        i.verdict === VERIFICATION_STATUS.UNVERIFIABLE ||
        i.checkType === "pixel_verification_available" ||
        i.checkType === "vision_model_available",
    );
  if (hasUnverifiable) {
    return {
      ok: false,
      canContinue: true,
      verified: false,
      status: VERIFICATION_STATUS.UNVERIFIABLE,
      issues: normIssues,
    };
  }

  // 3. Needs human judgment (aesthetic disagreements or subjective reviews)
  const hasHumanJudgment =
    options.needsHumanJudgment ||
    normIssues.some(
      (i) =>
        i.verdict === VERIFICATION_STATUS.NEEDS_HUMAN_JUDGMENT ||
        i.category === CHECK_CATEGORY.AESTHETIC,
    );
  if (hasHumanJudgment) {
    return {
      ok: false,
      canContinue: true,
      verified: false,
      status: VERIFICATION_STATUS.NEEDS_HUMAN_JUDGMENT,
      issues: normIssues,
    };
  }

  // 4. Clean pass
  return {
    ok: true,
    canContinue: true,
    verified: true,
    status: VERIFICATION_STATUS.VERIFIED,
    issues: normIssues,
  };
}
