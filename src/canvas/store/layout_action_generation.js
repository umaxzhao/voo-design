// Layout generation action seam: model streaming, critique, and version persistence.
import {
  streamLayoutText,
  StreamingLayoutFilter,
  resolveCanvasSize,
} from "./layout_action_helpers.js";
import {
  buildLayoutBrief,
  buildLayoutGenerationPrompt,
} from "../layout_skills.js";
import { RUN_STATUS } from "../nodes/types.js";
import {
  appendLayoutVersion,
  createLayoutProvenance,
} from "./layout_versions.js";
import { LAYOUT_EVENT, emitAgentPanelEvent } from "./agent_panel_bus.js";
import { createAsyncFinalCommit } from "./async-final-commit.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";
import { htmlToDocument } from "../editor/html_import.js";
import { measureText } from "../editor/text_metrics.js";
import {
  inspectGeneratedDocument,
  layoutQualityRetryReason,
} from "../layout_document_quality.js";
import { inferUiLayout } from "../layout_intent.js";
import {
  designSystemColorViolation,
  resolveDesignSystem,
} from "../design_systems.js";
import { resolveArtDirection } from "../layout_art_direction.js";
import {
  buildLayoutRetryPrompt,
  extractLayoutMarkup,
} from "./layout-output.js";
import { reviewGeneratedLayout } from "./layout_action_review.js";
import { DEFAULT_AGENT_MODEL } from "../../shared/agent-defaults.js";
import {
  captureLayoutReference,
  captureStoredReferenceImage,
} from "./layout_reference.js";

/** Design-node layout actions, spread into the workflow store. */
export function createLayoutGenerationActions(set, get) {
  return {
    /**
     * Calls the chat model for a constrained HTML layout and stores the raw
     * HTML as a new version. Parsing into layers happens automatically.
     */
    async generateLayout(nodeId, { referenceNodeId = null } = {}) {
      if (isWorkflowReadOnly(get())) return false;
      const node = get().nodes.find((candidate) => candidate.id === nodeId);
      if (!node || node.data?.status === RUN_STATUS.RUNNING) return false;

      const { collectTextInputs } =
        await import("../engine/graph_text_inputs.js");
      const upstreamText = collectTextInputs(nodeId, get().nodes, get().edges)
        .filter(Boolean)
        .join("\n\n");
      const instruction = (node.data?.aiPrompt ?? "").trim();
      if (!instruction && !upstreamText) {
        get().updateNodeData(nodeId, {
          status: RUN_STATUS.ERROR,
          stage: null,
          error: { code: "emptyPrompt" },
        });
        return false;
      }
      const finalCommit = createAsyncFinalCommit(get, "workflow.async.layout");

      const inferred = inferUiLayout(`${instruction}\n${upstreamText}`);
      const useInferredCanvas =
        inferred &&
        node.data?.layoutSkill === "poster" &&
        node.data?.layoutMedia === "poster" &&
        node.data?.layoutWidth == null &&
        node.data?.layoutHeight == null &&
        !node.data?.editorDoc;
      const media = useInferredCanvas ? inferred.media : node.data?.layoutMedia;
      const sizingNode = useInferredCanvas
        ? { ...node, data: { ...node.data, layoutMedia: media } }
        : node;
      // A mounted Design frame is the source of truth, including unsaved resize.
      const liveDocument =
        get().editorBridges?.[nodeId]?.engine?.getDocument?.();
      const liveSize =
        Number.isFinite(liveDocument?.width) &&
        liveDocument.width > 0 &&
        Number.isFinite(liveDocument?.height) &&
        liveDocument.height > 0
          ? {
              width: Math.round(liveDocument.width),
              height: Math.round(liveDocument.height),
            }
          : null;
      const { width, height } =
        liveSize ?? (await resolveCanvasSize(sizingNode));
      if (useInferredCanvas) {
        get().updateNodeData(nodeId, {
          layoutSkill: inferred.skill,
          layoutMedia: media,
          layoutWidth: width,
          layoutHeight: height,
        });
      }
      const referencePalette =
        node.data?.layoutReferencePalette?.colors ?? null;
      let reference = null;
      if (referenceNodeId) {
        try {
          reference = await captureLayoutReference(get(), referenceNodeId);
        } catch (error) {
          get().updateNodeData(nodeId, {
            status: RUN_STATUS.ERROR,
            stage: null,
            error: { code: error.message },
          });
          return false;
        }
      } else if (node.data?.layoutReferenceImage) {
        try {
          reference = await captureStoredReferenceImage(
            node.data.layoutReferenceImage,
          );
        } catch (error) {
          get().updateNodeData(nodeId, {
            status: RUN_STATUS.ERROR,
            stage: null,
            error: { code: error.message },
          });
          return false;
        }
      }
      if (
        reference?.image &&
        !reference.summary &&
        !(node.data?.layoutModel ?? DEFAULT_AGENT_MODEL).startsWith("codex:")
      ) {
        get().updateNodeData(nodeId, {
          status: RUN_STATUS.ERROR,
          stage: null,
          error: { code: "layoutReferenceVisionRequired" },
        });
        return false;
      }
      const referenceOwnsStyle =
        reference && (node.data?.layoutDesignSystem ?? "auto") === "auto";
      let designSystem;
      try {
        designSystem = resolveDesignSystem(
          node.data?.layoutDesignSystem ?? "auto",
          { prompt: `${instruction}\n${upstreamText}` },
        );
      } catch (error) {
        get().updateNodeData(nodeId, {
          status: RUN_STATUS.ERROR,
          stage: null,
          error: { code: "layoutDesignSystem", message: error.message },
        });
        return false;
      }
      const artDirection = resolveArtDirection({
        media,
        designSystem,
        content: `${instruction}\n${upstreamText}`,
      });
      const prompt = buildLayoutGenerationPrompt({
        instruction,
        upstreamText,
        media,
        style: node.data?.layoutStyle,
        direction: node.data?.layoutDirection,
        width,
        height,
        referencePalette: reference?.palette?.length
          ? reference.palette
          : referencePalette,
        referenceDesign:
          reference?.summary ??
          (reference?.image ? "参考图已作为视觉输入附在本次请求中。" : null),
        referenceVisual: Boolean(reference?.image),
        designSystem: referenceOwnsStyle ? null : designSystem.id,
      });

      get().updateNodeData(nodeId, {
        status: RUN_STATUS.RUNNING,
        stage: "streaming",
        error: null,
        layoutResolvedDesignSystem: designSystem.id,
        layoutResolvedArtDirection: artDirection.name,
      });
      // Enter the canvas immediately — the layout streams in as a live
      // preview while the model is still writing (OpenDesign-style), then
      // resolves into editable layers when the stream finishes.
      // Keep a grouped design's other pages on the free canvas while this
      // page streams; opening a single page would collapse the editor view.
      if (!(get().editingNodeIds ?? []).includes(nodeId)) {
        get().openImageEditor(nodeId);
      }
      get().setEditorSurface("editor");
      get().setEditorAiContext(true);
      // The drawer is the run's context view: it opens with the request and
      // then follows the stages, the model's reasoning, and the outcome.
      emitAgentPanelEvent(LAYOUT_EVENT.START, {
        nodeId,
        prompt: instruction || upstreamText,
      });
      if (node.data?.layoutReferencePalette) {
        emitAgentPanelEvent(LAYOUT_EVENT.PALETTE, {
          nodeId,
          palette: node.data.layoutReferencePalette,
        });
      }
      try {
        const measureContext = globalThis.document
          ?.createElement?.("canvas")
          ?.getContext?.("2d");
        // Quality checks are advisory: a text layer that cannot be measured
        // keeps its declared box, and never turns a parseable draft into a
        // parse failure.
        const measureTextNode = measureContext
          ? (textNode) => {
              try {
                return measureText(measureContext, textNode);
              } catch {
                return undefined;
              }
            }
          : undefined;
        const inspectCandidate = (candidate) => {
          if (!candidate)
            return { parseError: "layout-parse-empty", qualityIssues: [] };
          let doc;
          try {
            ({ doc } = htmlToDocument(candidate, { width, height }));
          } catch (error) {
            return {
              parseError: error?.message || "layout-parse-empty",
              qualityIssues: [],
            };
          }
          if (!doc.nodes?.length)
            return { parseError: "layout-parse-empty", qualityIssues: [] };
          return {
            parseError: null,
            qualityIssues: inspectGeneratedDocument(doc, { measureTextNode }),
          };
        };
        const candidateError = (candidate) => {
          const assessment = inspectCandidate(candidate);
          return (
            assessment.parseError ||
            layoutQualityRetryReason(assessment.qualityIssues)
          );
        };
        const brief = buildLayoutBrief({
          media,
          style: node.data?.layoutStyle,
          direction: node.data?.layoutDirection,
          designSystem: designSystem.id,
          content: `${instruction}\n${upstreamText}`,
        });
        emitAgentPanelEvent(LAYOUT_EVENT.DECISION, {
          nodeId,
          step: "layout_init",
          message: `${media || "poster"} • ${artDirection.name} • ${designSystem.id} (${width}x${height})`,
          decision: {
            media,
            style: node.data?.layoutStyle,
            direction: node.data?.layoutDirection,
            designSystem: designSystem.id,
            artDirection: artDirection.name,
            width,
            height,
          },
        });

        const pushVersion = (versionHtml) => {
          const version = {
            id: `layout-${crypto.randomUUID()}`,
            html: versionHtml,
            createdAt: Date.now(),
            meta: {
              media,
              style: node.data?.layoutStyle,
              direction: node.data?.layoutDirection,
              designSystem: designSystem.id,
              artDirection: artDirection.name,
              width,
              height,
            },
            provenance: createLayoutProvenance({
              model: node.data?.layoutModel,
              providerId: node.data?.layoutProvider,
              prompt: instruction || upstreamText,
              operation: "generate_layout",
            }),
          };
          return version;
        };

        const streamAttempt = async (attemptPrompt) => {
          const filter = new StreamingLayoutFilter({
            onReasoningChunk: (delta, accumulated) => {
              emitAgentPanelEvent(LAYOUT_EVENT.THINKING, {
                text: accumulated,
                delta,
              });
            },
            onHtmlChunk: (cleanHtml) => {
              const markup = extractLayoutMarkup(cleanHtml);
              if (markup) get().setStreamingPreview(markup, nodeId);
            },
          });
          const text = await streamLayoutText({
            model: node.data?.layoutModel,
            prompt: attemptPrompt,
            referenceImage: reference?.image,
            onChunk: ({ text: accumulated, reasoning }) => {
              filter.feedAccumulated(accumulated, reasoning);
            },
          });
          return text;
        };

        // Keep the last valid preview visible until editable layers replace it.
        const raw = await streamAttempt(prompt);
        if (!raw) throw new Error("noText");
        let html = extractLayoutMarkup(raw);
        let assessment = inspectCandidate(html);
        const invalidReason =
          assessment.parseError ||
          layoutQualityRetryReason(assessment.qualityIssues);
        if (invalidReason) {
          const retried = await streamAttempt(
            buildLayoutRetryPrompt(prompt, invalidReason),
          );
          const repairedHtml = extractLayoutMarkup(retried);
          const repairedAssessment = inspectCandidate(repairedHtml);
          // A quality retry may fail, but an already editable draft must not
          // disappear. Choose the parseable draft with fewer geometry issues.
          if (
            !repairedAssessment.parseError &&
            (assessment.parseError ||
              repairedAssessment.qualityIssues.length <
                assessment.qualityIssues.length)
          ) {
            html = repairedHtml;
            assessment = repairedAssessment;
          } else if (!assessment.parseError) {
            get().setStreamingPreview(html, nodeId);
          }
        }
        if (assessment.parseError) {
          const error = new Error(assessment.parseError);
          error.code = "layoutParse";
          throw error;
        }
        const colorIssue = referenceOwnsStyle
          ? null
          : designSystemColorViolation(html, designSystem);
        if (colorIssue) {
          // A palette mismatch is worth a repair attempt, but a valid editable
          // layout must still be delivered if the model ignores the request.
          try {
            const corrected = extractLayoutMarkup(
              await streamAttempt(buildLayoutRetryPrompt(prompt, colorIssue)),
            );
            if (
              !candidateError(corrected) &&
              !designSystemColorViolation(corrected, designSystem)
            ) {
              html = corrected;
            } else {
              get().setStreamingPreview(html, nodeId);
            }
          } catch {
            get().setStreamingPreview(html, nodeId);
          }
        }
        let review = null;
        // Critique and retain an improvement only when it parses, follows the
        // selected palette, and scores at least as well as the first draft.
        if (!reference && node.data?.layoutAutoImprove !== false) {
          ({ html, review } = await reviewGeneratedLayout({
            html,
            brief,
            content: `${instruction}\n${upstreamText}`,
            model: node.data?.layoutModel,
            nodeId,
            width,
            height,
            designSystem,
            candidateError,
            streamAttempt,
            setStage: (stage) => {
              get().updateNodeData(nodeId, { stage });
              emitAgentPanelEvent(LAYOUT_EVENT.STAGE, { nodeId, stage });
            },
            restorePreview: (draft) => get().setStreamingPreview(draft, nodeId),
          }));
        }

        // 3) Store the (possibly improved) layout as a version.
        const storeVersion = (versionHtml) => {
          const qualityIssues = inspectCandidate(versionHtml).qualityIssues;
          const version = pushVersion(versionHtml);
          const current = get().nodes.find(
            (candidate) => candidate.id === nodeId,
          );
          if (current) finalCommit.commit();
          get().updateNodeData(nodeId, {
            layoutHtml: versionHtml,
            layoutVersions: appendLayoutVersion(
              current?.data?.layoutVersions,
              version,
            ),
            selectedLayoutVersionId: version.id,
            layoutReview: review,
            layoutQualityIssues: qualityIssues,
            status: RUN_STATUS.RUNNING,
            stage: "parsing",
          });
        };
        storeVersion(html);
        // The user asked for "generate then land in the layers" — parse and
        // open the editor automatically.
        emitAgentPanelEvent(LAYOUT_EVENT.STAGE, { nodeId, stage: "parsing" });
        // Only materialized layers count as a successful generation.
        const materialize = () =>
          get().parseLayoutHtml(nodeId, {
            requireLayers: true,
            preserveSurfaceChoice: true,
            canvasSize: { width, height },
          });
        let parsed = await materialize();
        if (!parsed) {
          const parseReason =
            get().nodes.find((candidate) => candidate.id === nodeId)?.data
              ?.error?.message ?? "layout-parse-empty";
          const repaired = extractLayoutMarkup(
            await streamAttempt(buildLayoutRetryPrompt(prompt, parseReason)),
          );
          if (!candidateError(repaired)) {
            html = repaired;
            storeVersion(html);
            parsed = await materialize();
          }
        }
        get().setStreamingPreview(null);
        if (parsed) {
          emitAgentPanelEvent(LAYOUT_EVENT.DONE, { nodeId });
        } else {
          const parseError = get().nodes.find(
            (candidate) => candidate.id === nodeId,
          )?.data?.error;
          emitAgentPanelEvent(LAYOUT_EVENT.ERROR, {
            nodeId,
            code: parseError?.code ?? "layoutParse",
            message: parseError?.message,
          });
        }
        return parsed;
      } catch (error) {
        get().setStreamingPreview(null);
        const code = error?.code ?? error?.message ?? "generic";
        get().updateNodeData(nodeId, {
          status: RUN_STATUS.ERROR,
          stage: null,
          error: { code, message: error?.message },
        });
        emitAgentPanelEvent(LAYOUT_EVENT.ERROR, {
          nodeId,
          code,
          message: error?.message,
        });
        return false;
      }
    },
  };
}
