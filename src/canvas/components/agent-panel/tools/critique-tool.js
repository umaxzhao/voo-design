// Critique tool protocol and execution seam (Package B).
import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { loadGlobalBrands } from "../../../agent-runtime/global-memory.js";
import {
  formatGuidelines,
  VOO_PRINCIPLES,
  ANTI_SLOP_RULES,
} from "./critique-guidelines.js";
import { resolveDocument } from "./critique-document.js";
import { evaluateDeterministicRules } from "./critique-rules.js";
import {
  CHECK_CATEGORY,
  normalizeVerificationIssue,
  computeVerificationOutcome,
} from "../verification-evidence.js";
import { verifyVisualArtifact } from "../verify-visual-artifact.js";

const critiqueDesignTool = {
  spec: {
    name: "critique_design",
    description:
      "Review a generated image or layout against VOO's design principles and anti-AI-slop rules. Detects deterministic layout issues (text overflow, safe margin violations, misalignment, size mismatch, insufficient contrast) and optional multimodal visual defects. Returns structured evidence with target objects, regions, and fix suggestions.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description:
            "Describe the generated artifact to review (composition, colors, type, style).",
        },
        kind: {
          type: "string",
          enum: ["image", "layout", "workflow"],
          description: "What kind of artifact is being reviewed.",
        },
        document: {
          type: "object",
          description:
            "Optional document object containing canvas dimensions, safe margins, and nodes/layers to critique.",
        },
        targetSpecs: {
          type: "object",
          properties: {
            width: { type: "number", description: "Target width in pixels" },
            height: { type: "number", description: "Target height in pixels" },
          },
          description:
            "Expected target specifications (e.g. output dimensions).",
        },
        safeMargin: {
          type: "number",
          description:
            "Safe area margin in pixels from each edge (default: 16).",
        },
        visualReview: {
          type: "boolean",
          description:
            "Optional: perform multimodal visual artifact review (default false). When true, inspects render for defects, seams, and visual artifacts.",
        },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,
  /** Reviewing needs a description of the artifact. */
  requires: { args: ["description"] },
  async execute(args, context) {
    const doc = resolveDocument(args, context);
    const docVersion =
      doc?.version ?? doc?._version ?? context?.documentVersion ?? null;
    const storeBrief =
      context?.getStore?.()?.getProjectBrief?.() ||
      context?.getCanvasState?.()?.projectBrief ||
      null;
    const globalBrands =
      args?.globalBrands ??
      context?.globalBrands ??
      context?.getCanvasState?.()?.globalBrands ??
      (typeof loadGlobalBrands === "function" ? loadGlobalBrands() : []);
    const effectiveArgs = {
      ...args,
      globalBrands,
      projectBrief:
        args?.projectBrief ?? doc?.projectBrief ?? storeBrief ?? undefined,
    };

    // 1. Evaluate deterministic rules (never downgraded by subjective opacity or confidence)
    const rawIssues = evaluateDeterministicRules(doc, effectiveArgs);
    const normalizedIssues = rawIssues.map((issue) =>
      normalizeVerificationIssue(issue, {
        sourceVersion: docVersion,
        category: CHECK_CATEGORY.SPEC,
      }),
    );

    // 2. Perform visual recheck only when explicitly requested (not enabled by default)
    let visualIssues = [];
    if (args?.visualReview || context?.visualReview) {
      const visualOutcome = await verifyVisualArtifact(
        { ...args, visualReview: true, sourceVersion: docVersion },
        null,
        context?.observe,
        context,
      );
      if (Array.isArray(visualOutcome?.issues)) {
        visualIssues = visualOutcome.issues;
      }
    }

    const allIssues = [...normalizedIssues, ...visualIssues];
    const outcome = computeVerificationOutcome(allIssues);

    const summary = {
      errors: allIssues.filter((i) => i.severity === "error").length,
      warnings: allIssues.filter((i) => i.severity === "warning").length,
      infos: allIssues.filter((i) => i.severity === "info").length,
    };

    return {
      issues: allIssues,
      summary,
      guidelines: formatGuidelines(),
      kind: args.kind || "layout",
      description: args.description,
      principles: VOO_PRINCIPLES,
      antiSlopRules: ANTI_SLOP_RULES,
      instruction:
        "Check the described artifact against every principle and rule above. Report each violation as a concrete fix, then revise the artifact accordingly before presenting it.",
      status: outcome.status,
      ok: outcome.ok,
      canContinue: outcome.canContinue,
      verified: outcome.verified,
      sourceVersion: docVersion,
    };
  },
  presentCall(args) {
    return { title: `Critique design (${args.kind || "layout"})`, icon: "eye" };
  },
  presentResult(_args, result) {
    if (result?.summary && result?.issues) {
      const { errors, warnings } = result.summary;
      if (errors > 0 || warnings > 0)
        return {
          title: `Critique found ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`,
          status: "completed",
        };
      return { title: "Critique passed (0 issues)", status: "completed" };
    }
    return {
      title: `Critique checklist ready (${result?.principles?.length ?? 0} principles, ${result?.antiSlopRules?.length ?? 0} anti-slop rules)`,
      status: "completed",
    };
  },
};

export default critiqueDesignTool;
