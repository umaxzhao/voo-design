import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { t } from "../../../../shared/i18n.js";
import { autoFixDocument } from "../design-autofix.js";
import { resolveDocument } from "./critiqueDesign.js";
import critiqueDesignTool from "./critiqueDesign.js";
import { applyDesignPatches } from "./autoFixDesign.js";

function clampRounds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(2, Math.floor(parsed)));
}

function hasErrors(issues) {
  return issues.some((issue) => issue?.severity === "error");
}

async function critique(doc, args, context) {
  const result = await critiqueDesignTool.execute(
    {
      ...args,
      document: doc,
      description: args.description || "Design document",
    },
    context,
  );
  return Array.isArray(result?.issues) ? result.issues : [];
}

const tool = {
  spec: {
    name: "iterate_design",
    description: "Critique a design, apply safe deterministic fixes, and re-critique for up to two rounds.",
    parameters: {
      type: "object",
      properties: {
        document: { type: "object", description: "Design document to review and fix." },
        description: { type: "string", description: "Brief description of the design." },
        targetSpecs: {
          type: "object",
          properties: { width: { type: "number" }, height: { type: "number" } },
        },
        maxRounds: { type: "integer", minimum: 1, maximum: 2, description: "Maximum critique/fix rounds (default 1)." },
        targetNodeId: { type: "string", description: "Optional editor artboard node id." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  approvalLevel: TOOL_APPROVAL_LEVEL.CANVAS_MUTATION,
  capabilities: { mutates: true, externalData: false, reversible: true, idempotent: true },
  async execute(args, context) {
    const store = context?.getStore?.();
    let doc = resolveDocument(args, context);
    if (!doc) throw new Error("A design document is required.");
    const maxRounds = clampRounds(args?.maxRounds);
    const rounds = [];
    let issues = await critique(doc, args, context);

    for (let index = 0; index < maxRounds; index += 1) {
      if (index > 0 && !hasErrors(issues)) break;
      const issuesBefore = issues;
      const outcome = autoFixDocument(doc, issuesBefore, {
        ...(args?.targetSpecs ?? {}),
        targetWidth: args?.targetSpecs?.width,
        targetHeight: args?.targetSpecs?.height,
      });
      if (outcome.patches.length > 0) {
        await applyDesignPatches(outcome.patches, args, context, store);
        doc = resolveDocument(args, context) ?? doc;
      }
      const issuesAfter = await critique(doc, args, context);
      rounds.push({
        issuesBefore,
        fixed: outcome.fixed,
        issuesAfter,
      });
      issues = issuesAfter;
      if (!hasErrors(issuesAfter)) break;
    }

    return {
      rounds,
      remaining: issues,
      converged: !hasErrors(issues),
    };
  },
  presentCall() {
    return { title: t("agent.tool.iterateDesign.call"), icon: "wand" };
  },
  presentResult(_args, result) {
    return {
      title: t("agent.tool.iterateDesign.result", { rounds: result?.rounds?.length ?? 0 }),
      status: result?.converged ? "completed" : "failed",
    };
  },
};

export default tool;
