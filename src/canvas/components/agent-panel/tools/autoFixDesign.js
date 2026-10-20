import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { t } from "../../../../shared/i18n.js";
import { evaluateDeterministicRules, resolveDocument } from "./critiqueDesign.js";
import { autoFixDocument } from "../design-autofix.js";

/**
 * Lands auto-fix patches on the open design document.
 *
 * The document these patches belong to is the design editor's, so the patches
 * travel the same route every other editor mutation takes: the workflow store's
 * command bridge, which forwards to `apply_design_patches` in the editor command
 * table (src/canvas/editor/command_table/implementations_part2.js).
 *
 * There is deliberately no in-process callback here. An earlier revision
 * offered `context.applyDesignPatches` / `store.applyDesignPatches` fallbacks
 * that no production caller ever supplied, and a unit test injected the first
 * one, so the suite stayed green while every real fix threw ARGS_INVALID:
 * "Unknown editor command". A seam nobody wires is not a seam.
 */
export async function applyDesignPatches(patches, args, context, store = context?.getStore?.()) {
  if (typeof store?.runEditorCommand !== "function") {
    throw new Error("Design editor command bridge is unavailable.");
  }
  return store.runEditorCommand({
    tool: "apply_design_patches",
    args: { patches, targetNodeId: args?.targetNodeId },
  });
}

const tool = {
  spec: {
    name: "auto_fix_design",
    description: "Safely fix text overflow, near-alignment, and requested artboard size issues, then re-run critique.",
    parameters: {
      type: "object",
      properties: {
        document: { type: "object", description: "Design document to fix." },
        issues: { type: "array", description: "Structured issues returned by critique_design." },
        targetSpecs: {
          type: "object",
          properties: {
            width: { type: "number" },
            height: { type: "number" },
          },
        },
        targetNodeId: { type: "string", description: "Optional editor artboard node id." },
      },
      required: ["issues"],
      additionalProperties: false,
    },
  },
  approvalLevel: TOOL_APPROVAL_LEVEL.CANVAS_MUTATION,
  capabilities: { mutates: true, externalData: false, reversible: true, idempotent: true },
  async execute(args, context) {
    const store = context?.getStore?.();
    let doc = resolveDocument(args, context);
    if (!doc) throw new Error("A design document is required.");
    const rounds = [];
    let remaining = Array.isArray(args.issues) ? args.issues : [];
    for (let round = 0; round < 2 && remaining.length > 0; round += 1) {
      const outcome = autoFixDocument(doc, remaining, {
        ...(args.targetSpecs ?? {}),
        targetWidth: args.targetSpecs?.width,
        targetHeight: args.targetSpecs?.height,
      });
      rounds.push({ fixed: outcome.fixed, skipped: outcome.skipped });
      if (outcome.patches.length === 0) {
        remaining = outcome.skipped.map((entry) => entry.issue);
        break;
      }
      await applyDesignPatches(outcome.patches, args, context, store);
      doc = resolveDocument(args, context) ?? doc;
      remaining = evaluateDeterministicRules(doc, {
        targetSpecs: args.targetSpecs,
        targetWidth: args.targetSpecs?.width,
        targetHeight: args.targetSpecs?.height,
      });
    }
    return {
      fixed: rounds.flatMap((round) => round.fixed),
      remaining,
      rounds: rounds.length,
    };
  },
  presentCall() {
    return { title: t("agent.tool.autoFixDesign.call"), icon: "wand" };
  },
  presentResult(_args, result) {
    return {
      title: t("agent.tool.autoFixDesign.result", { count: result?.fixed?.length ?? 0 }),
      status: "completed",
    };
  },
};

export default tool;
