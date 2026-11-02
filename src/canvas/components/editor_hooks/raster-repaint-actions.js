import { callHost, getEnvironment } from "../../rpc.js";
import { RPC } from "../../../shared/messages.js";
import { PROVIDER_ID } from "../../../shared/providers.js";
import { EXECUTION_MODE, PLATFORM_TARGET } from "../../generation_routes.js";
import { useDesignStore } from "../../../store/design_store.js";
import { MODEL_ROUTE_ID } from "../../../shared/model-routes.js";
import { onLocalBackendStarting } from "../../../shared/local_backend_events.js";
import { resolveRepaintRoute } from "../../editor/repaint_route.js";
import { EDITOR_GENERATED_OPERATION, EDITOR_SCENE_PATCH } from "../../editor/editor_generated_output.js";
import { resolveRepaintChain, repaintChainReady, resolveSelectionRepaintRoute, makeSelectionRepaintPaint } from "./raster-route-helpers.js";
import { repaintFailureCode } from "./raster-action-helpers.js";

const TRANSPARENT_BACKGROUND_INSTRUCTION =
  "Return a PNG with a true alpha channel. Keep only the requested edited " +
  "subject or pixels; make every surrounding/background pixel fully " +
  "transparent (alpha 0). Do not add a backdrop, solid colour, shadow, " +
  "checkerboard, or transparency grid. Preserve existing transparent pixels.";

/** Optional raster action implementation, loaded only from an explicit action. */
export function createRepaintActions(context) {
  const { engine, selected, repaintBusy, selectionRepaintBusy, setMaskError, setRepaintBusy, setRepaintStatus, setSelectionRepaintBusy, emitGeneratedOutput, onMaterializeGeneratedOutput, inFlightAbortRef, isCurrent } = context;
const runRepaint = async (
    node,
    instruction,
    {
      platform = PLATFORM_TARGET.CHATGPT,
      executionMode,
      providerId,
      modelId,
      transparentBackground = true,
    } = {},
  ) => {
    if (!isCurrent()) return false;
    if (!engine || !node || repaintBusy) return;
    setRepaintBusy(true);
    setMaskError(false);
    setRepaintStatus(null);
    // An installed-but-stopped managed backend is booted inside the submit
    // call; the provider announces it, and the busy overlay has to say so
    // rather than look dead for as long as the boot takes (contract §6.6).
    const stopBackendWatch = onLocalBackendStarting(() =>
      setRepaintStatus({ phase: "starting" }),
    );
    let abortController = null;
    try {
      const sourceSnapshot = engine.serialise?.();
      const resolved = await resolveRepaintChain({
        routeId: MODEL_ROUTE_ID.REPAINT,
        providerId,
        modelId,
      });
      const primary = resolved.chain[0] ?? { providerId: null, modelId: null };
      const activeExecutionMode =
        primary.providerId === PROVIDER_ID.LOCAL
          ? EXECUTION_MODE.API
          : executionMode;
      const source = engine.exportNodePng(node.id) ?? node.dataUrl ?? node.src;
      if (!source) throw new Error("bitmapMissing");

      // The managed local backend may be stopped but can start on submit.
      const hasApiProvider = await repaintChainReady(resolved);
      const route = resolveRepaintRoute({
        hasApiProvider,
        environment: getEnvironment(),
        providerId: primary.providerId,
        modelId: primary.modelId,
        platform,
        executionMode: activeExecutionMode,
      });

      const effectivePrompt = transparentBackground
        ? `${TRANSPARENT_BACKGROUND_INSTRUCTION}\n\n${instruction}`
        : instruction;
      const effectiveExecutionMode = activeExecutionMode;
      abortController = new AbortController();
      inFlightAbortRef.current = abortController;

      let painted;
      let usedProvider = primary;
      if (route.route === "api") {
        const { repaintLayer } = await import("../../editor/layer_repaint.js");
        if (!isCurrent()) return false;
      painted = await repaintLayer({
          dataUrl: source,
          prompt: effectivePrompt,
          // A locked pick runs alone; otherwise the chain may degrade.
          providerId: resolved.locked ? primary.providerId : undefined,
          modelId: resolved.locked ? primary.modelId : undefined,
          providers: resolved.locked ? undefined : resolved.chain,
          routeId: MODEL_ROUTE_ID.REPAINT,
          shouldStop: () => abortController.signal.aborted,
          onStatus: (state) => {
            if (state?.providerId) {
              usedProvider = {
                providerId: state.providerId,
                modelId: state.modelId,
              };
            }
            setRepaintStatus(state ?? null);
          },
        });
      } else if (route.route === "chat") {
        // Send directly to the web platform chat session (ChatGPT / Gemini / Jimeng),
        // asking for a transparent background so the returned PNG keeps its alpha.
        const settings = useDesignStore.getState().settings;
        if (!isCurrent()) return false;
      const result = await callHost(
          RPC.GENERATE,
          {
            nodeId: node.id,
            prompt: effectivePrompt,
            images: [source],
            timeoutMs: settings.timeoutMs,
            settleMs: settings.settleMs,
            autoScroll: settings.autoScroll,
          },
          { timeout: settings.timeoutMs + 30000, platform },
        );
        painted = result?.images?.[0];
      } else {
        // No image provider key AND this environment cannot reach a chat page
        // (voo.run hosted/standalone). Surface an actionable hint instead of a
        // silent failure (plan-design-editor-fixes A4).
        setMaskError("noRepaintRouteAvailable");
        return;
      }

      if (!painted) throw new Error("noResult");
      return await emitGeneratedOutput(
        {
          dataUrl: painted,
          operation: EDITOR_GENERATED_OPERATION.AI_REPAINT,
          parameters: {
            prompt: instruction,
            platform: route.platform ?? platform,
            executionMode: effectiveExecutionMode,
            providerId: usedProvider?.providerId,
            modelId: usedProvider?.modelId,
            transparentBackground,
          },
          scenePatch: { type: EDITOR_SCENE_PATCH.REPLACE_BITMAP },
          sourceSceneNodeId: node.id,
          sourceSnapshot,
        },
        onMaterializeGeneratedOutput,
      );
    } catch (err) {
      if (!isCurrent()) return false;
      console.error("layer repaint failed", err);
      // Missing image-provider key gets its own actionable copy instead of
      // the generic failure line (plan-design-editor-fixes A4).
      setMaskError(repaintFailureCode(err));
    } finally {
      if (inFlightAbortRef.current === abortController) {
        inFlightAbortRef.current = null;
      }
      stopBackendWatch();
      setRepaintStatus(null);
      setRepaintBusy(false);
    }
  };

const runSelectionRepaint = async (
    prompt,
    {
      platform = PLATFORM_TARGET.CHATGPT,
      executionMode,
      providerId,
      modelId,
    } = {},
  ) => {
    if (!isCurrent()) return false;
    if (!engine || selectionRepaintBusy || !prompt?.trim()) return;
    setSelectionRepaintBusy(true);
    setMaskError(false);
    setRepaintStatus(null);
    const stopBackendWatch = onLocalBackendStarting(() =>
      setRepaintStatus({ phase: "starting" }),
    );
    const abortController = new AbortController();
    inFlightAbortRef.current = abortController;
    try {
      const resolved = await resolveRepaintChain({
        routeId: MODEL_ROUTE_ID.SELECTION_REPAINT,
        providerId,
        modelId,
      });
      const primary = resolved.chain[0] ?? { providerId: null, modelId: null };
      const activeExecutionMode =
        primary.providerId === PROVIDER_ID.LOCAL
          ? EXECUTION_MODE.API
          : executionMode;

      const hasApiProvider = await repaintChainReady(resolved);
      const route = resolveSelectionRepaintRoute({
        hasApiProvider,
        environment: getEnvironment(),
        providerId: primary.providerId,
        modelId: primary.modelId,
        platform,
        // Inherit the API default unless the caller explicitly selected chat.
        executionMode: activeExecutionMode,
      });

      if (route.route === "unavailable") {
        // The selected/default route has no usable provider configuration.
        setMaskError("noRepaintRouteAvailable");
        return;
      }

      const settings = useDesignStore.getState().settings;
      const paint = makeSelectionRepaintPaint({
        route,
        nodeId: engine?.getPixelSelection?.()?.nodeId ?? selected?.id,
        settings,
        providerId: resolved.locked ? primary.providerId : undefined,
        modelId: resolved.locked ? primary.modelId : undefined,
        providers: resolved.chain,
        routeId: MODEL_ROUTE_ID.SELECTION_REPAINT,
        platform,
        shouldStop: () => abortController.signal.aborted,
        onStatus: (state) => setRepaintStatus(state ?? null),
      });

      if (!isCurrent()) return false;
      const done = await engine.aiRepaintPixelSelection?.({
        prompt: prompt.trim(),
        providerId: primary?.providerId,
        modelId: primary?.modelId,
        paint,
      });
      if (done === false) setMaskError(true);
    } catch (err) {
      if (!isCurrent()) return false;
      console.error("selection ai repaint failed", err);
      // No image-provider key is a configuration gap, not a failed call: the
      // error surface must say what to do, not just that something broke
      // (plan-design-editor-fixes A4).
      setMaskError(repaintFailureCode(err));
    } finally {
      if (inFlightAbortRef.current === abortController) {
        inFlightAbortRef.current = null;
      }
      stopBackendWatch();
      setRepaintStatus(null);
      setSelectionRepaintBusy(false);
    }
  };
  return { runRepaint, runSelectionRepaint };
}
