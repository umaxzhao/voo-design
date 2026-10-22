/**
 * The image editor's AI raster actions, extracted verbatim from
 * image_editor.jsx (plan-design-editor-fixes A5-2): background removal,
 * lasso erase/keep and model cutout, object selection and the Remove brush,
 * region cutout, layer repaint, and AI repaint of the pixel selection.
 *
 * Pure extraction — no behaviour change. The component keeps owning the
 * engine and the derived selection values (selected/lasso/pending stroke);
 * the hook owns the six busy/error/progress flags those actions toggle and
 * returns them alongside the callbacks, so the JSX reads them straight off
 * the destructure.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { callHost, getEnvironment } from "../../rpc.js";
import { RPC } from "../../../shared/messages.js";
import {
  LOCAL_ENGINE_DEFAULT_MODEL_ID,
  PROVIDER_ID,
} from "../../../shared/providers.js";
import { EXECUTION_MODE, PLATFORM_TARGET } from "../../generation_routes.js";
import { getProviderConfig } from "../../provider_client.js";
import { resolveRepaintRoute } from "../../editor/repaint_route.js";
import { compositePlan } from "../../editor/outpaint_geometry.js";
import { protectRectForSaliency } from "../../editor/outpaint_direction.js";
import {
  computeSaliencyMap,
  SALIENCY_ANALYSIS_MAX_EDGE,
} from "../../editor/saliency_map.js";
import {
  DEFAULT_OUTPAINT_PRIME_MODE,
  DEFAULT_OUTPAINT_SEAM,
  compositeOutpaintResult,
  primeOutpaintMargin,
} from "../../editor/outpaint_composite.js";
import { decodeImageSource } from "../../editor/bitmap_cache.js";
import {
  readBitmapSize,
  readImageRgba,
  rgbaToPngDataUrl,
} from "../bitmap_pixels.js";
import {
  hasRetouchWork,
  retouchBudgetError,
  retouchOptions,
} from "../../editor/portrait_retouch_plan.js";
import { dataUrlToBlob } from "../../store/db.js";
import { regionHost } from "../../editor/doc_ops.js";
import { maskErrorCode } from "../../editor/mask_error.js";
import { useDesignStore } from "../../../store/design_store.js";
import {
  MODEL_ROUTE_ID,
  PERFORMANCE_TIER_KEY,
  getPerformanceTier,
} from "../../../shared/model-routes.js";
import { PERFORMANCE_TIER } from "../../../shared/performance-tier.js";
import { onSettingChange } from "../../../shared/settings.js";
import { onLocalBackendStarting } from "../../../shared/local_backend_events.js";
import { resolveCanvasModelRouteFallbackChain } from "../../model_route_resolver.js";
import {
  createEditorGeneratedOutput,
  createOutpaintScenePatch,
  EDITOR_GENERATED_OPERATION,
  EDITOR_SCENE_PATCH,
} from "../../editor/editor_generated_output.js";

/**
 * Appended to a chat-page repaint prompt so the produced PNG keeps its own
 * alpha (a transparent background) rather than coming back on a filled
 * backdrop. The chat path is the only one that can deliver a transparent
 * channel this round: the API providers do not expose a `background`/
 * `output_format` flag, so an API repaint can return a flattened image.
 */
const TRANSPARENT_BACKGROUND_INSTRUCTION =
  "Return a PNG with a true alpha channel. Keep only the requested edited " +
  "subject or pixels; make every surrounding/background pixel fully " +
  "transparent (alpha 0). Do not add a backdrop, solid colour, shadow, " +
  "checkerboard, or transparency grid. Preserve existing transparent pixels.";

/**
 * Outpainting is the opposite of a repaint: the composite arrives with the
 * original picture inside a canvas grown by the drag, and the model must FILL
 * the grown border — seamlessly continuing the scene — while keeping every
 * original pixel untouched. That border is no longer transparent: it is primed
 * with a continuation of the picture (see outpaint_composite.js), so the model
 * is told to treat it as a placeholder to refine rather than a hole to fill.
 * No transparency instruction here: the delivered image must be fully painted
 * edge to edge.
 */
const OUTPAINT_INSTRUCTION =
  "Outpaint this image: the attached canvas has the original picture surrounded " +
  "by a coarse edge-extension of it, which is only a placeholder. Replace that " +
  "placeholder border with a seamless continuation of the scene, matching the " +
  "original lighting, perspective, texture and colour palette so the join is " +
  "invisible. Do not move, crop, restyle or repaint the original pixels. " +
  "Return one fully painted image at the same canvas size.";

/**
 * The failure state a retouch reports: the code, plus a sequence that changes
 * on every failure.
 *
 * Exported and pure so the identity rule is testable without a React render.
 * The editor shows the code through an effect keyed on the value, and the same
 * code failing twice in a row would otherwise be an equal state — no re-render,
 * no effect, no toast, a button that looks broken the second time.
 */
export function nextRetouchFailure(current, code) {
  return { code, seq: (current?.seq ?? 0) + 1 };
}

/**
 * Yields to the browser once, so a state change made just before it gets a
 * frame to be painted in.
 *
 * The portrait retouch is a single synchronous call over the whole layer (see
 * RETOUCH_MAX_PIXELS for the measured cost), and it runs in the same task as
 * the state update that disables its button — without this yield the browser
 * never paints that busy state and the click reads as a frozen button. The
 * inner timeout is what lands the continuation after the frame rather than
 * before it; hosts without `requestAnimationFrame` fall back to the timeout.
 */
function nextPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/**
 * Reads a decoded bitmap into RGBA bytes at the requested size. Both parsing
 * and producing pixels go through a canvas here because that is the only pixel
 * access all three hosts share.
 */
function readImageRgbaAt(bitmap, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/**
 * Reads a decoded bitmap at the saliency analysis cap and turns it into a
 * saliency map, or null. The read goes through `readImageRgba` (DOM lives in
 * the adapter) and every failure — no size, a throw from the reader, a
 * signal-less image — collapses to null so the outpaint path behaves exactly
 * as it did before saliency existed.
 */
function readBitmapSaliency(bitmap) {
  if (!bitmap) return null;
  try {
    const { rgba, width, height } = readImageRgba(bitmap, {
      maxEdge: SALIENCY_ANALYSIS_MAX_EDGE,
    });
    return computeSaliencyMap({ rgba, width, height });
  } catch {
    return null;
  }
}

/**
 * The rect outpaint actually composites: the requested one, grown outward only
 * when the subject would otherwise be cut or pinched against an edge. Saliency
 * can only add margin — the result always contains `rect`, so it can never
 * shrink the user's framing decision — and an unusable map returns `rect`
 * untouched. The decision itself lives in the pure `protectRectForSaliency`.
 */
function protectOutpaintRect(bitmap, node, rect) {
  const saliency = readBitmapSaliency(bitmap);
  if (!saliency) return rect;
  return protectRectForSaliency(rect, saliency, {
    frameX: node?.x ?? 0,
    frameY: node?.y ?? 0,
    frameWidth: node?.width,
    frameHeight: node?.height,
  });
}

/**
 * Route resolution for the selection-repaint action.
 *
 * This is the same resolver runRepaint/runOutpaint use. An omitted execution
 * mode inherits its API default; an explicit chat choice remains available.
 * Provider/model selection comes from the shared route preferences, including
 * the built-in 302.AI route and any saved per-tool override.
 *
 * Exported as a pure helper so the caller-side rule is unit-testable without
 * a React render.
 */
export function resolveSelectionRepaintRoute({
  hasApiProvider,
  environment = {},
  providerId,
  modelId,
  platform = PLATFORM_TARGET.CHATGPT,
  executionMode,
}) {
  return resolveRepaintRoute({
    hasApiProvider,
    environment,
    providerId,
    modelId,
    platform,
    executionMode,
  });
}

/**
 * The provider lock a caller puts on an editor AI action.
 *
 * The repaint/selection panels show the route's resolved provider as their
 * starting value. That is a *default*, not a choice: sending it as an explicit
 * `providerId` would turn "whoever the route picks" into "this one only", which
 * disables degradation and makes a stopped local engine a dead end instead of a
 * cloud edit (docs/plan-qwen21-primary.md §3.3-2). Only a control the user
 * actually moved (`providerTouched`) yields a lock; then the exact pair travels,
 * so a chosen model is not replaced by the provider's default.
 *
 * @param {{ providerId?: string, modelId?: string, providerTouched?: boolean }} state
 * @returns {{ providerId?: string, modelId?: string|null }}
 */
export function explicitRouteSelection({
  providerId,
  modelId,
  providerTouched = false,
} = {}) {
  if (!providerTouched || !providerId) return {};
  return { providerId, modelId: modelId ?? null };
}

/**
 * The provider chain one repaint runs on.
 *
 * An explicit pick locks the chain to exactly that provider/model pair. With
 * none, the Settings route for `routeId` decides: its built-in default is the
 * managed local model, which may degrade to a configured cloud candidate, and
 * a stored choice locks. Pinning the local model here instead (as the editor
 * once did) stranded every machine without the local engine — the web app,
 * the extension, and a desktop that never downloaded it.
 *
 * @param {{ routeId: string, providerId?: string, modelId?: string }} input
 * @param {{ routeChain?: (routeId: string) => Promise<Array<object>> }} [deps]
 * @returns {Promise<{ locked: boolean, chain: Array<{ providerId: string, modelId?: string|null }> }>}
 */
export async function resolveRepaintChain(
  { routeId, providerId, modelId },
  { routeChain = editorRouteChain } = {},
) {
  if (providerId) {
    return {
      locked: true,
      chain: [
        {
          providerId,
          modelId:
            modelId ??
            (providerId === PROVIDER_ID.LOCAL
              ? LOCAL_ENGINE_DEFAULT_MODEL_ID
              : null),
        },
      ],
    };
  }
  return { locked: false, chain: await routeChain(routeId) };
}

/**
 * Whether a resolved repaint chain can run over the API. A locked cloud pick
 * must hold a key; the local engine can boot on submit; an unlocked chain only
 * lists candidates that are ready or can start.
 */
async function repaintChainReady({ locked, chain }) {
  if (chain.length === 0) return false;
  if (!locked) return true;
  const { providerId } = chain[0];
  return providerId === PROVIDER_ID.LOCAL || providerIsConfigured(providerId);
}

/**
 * The provider chain one editor AI action runs on, in priority order.
 *
 * An explicit `providerId` (the user's own pick for this action) locks the
 * chain; otherwise the shared route decides, where a stored choice locks and
 * the built-in default (local + Qwen Image 2.1) does not — so a local failure
 * degrades to the next configured candidate.
 *
 * @param {string} routeId
 * @param {string} [providerId]
 * @returns {Promise<Array<{ providerId: string, modelId?: string|null }>>}
 */
async function editorRouteChain(routeId, providerId) {
  try {
    return await resolveCanvasModelRouteFallbackChain(routeId, {
      lockedProviderId: providerId,
    });
  } catch {
    // A resolver that cannot read storage is an empty chain, not a crash: the
    // action then reports the same actionable "no route" state as an empty one.
    return [];
  }
}

/** Whether one provider can accept a request right now (its own credentials). */
async function providerIsConfigured(providerId) {
  if (!providerId) return false;
  try {
    const config = await getProviderConfig({ providerId });
    return Boolean(config?.configured);
  } catch {
    return false;
  }
}

/**
 * The code the editor's error surface should show for a failed AI action.
 *
 * `maskErrorCode` already promotes a missing provider key into its own
 * actionable line. A local backend that cannot run — not installed, not
 * started, or unreachable from an https page — with no configured cloud
 * candidate behind it is the same kind of dead end: the chain is exhausted and
 * nothing in "Failed: error" tells the user what to do. It takes the same
 * actionable line. A cancellation is a user action, not a dead end, so it is
 * left alone.
 *
 * @param {any} error
 * @returns {string|boolean}
 */
export function repaintFailureCode(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code.startsWith("localBackend.") && code !== "localBackend.cancelled") {
    return "noRepaintRouteAvailable";
  }
  return maskErrorCode(error);
}

/**
 * The one-line hint the current tier owes the editor, or null.
 *
 * The middle tier is where the request budget actually bites (the local engine
 * is capped at 512 px / 20 steps, `localBudget.clamped`), and an unmeasurable
 * machine is treated as the middle tier everywhere it is consumed, so the same
 * sentence covers both. The low tier's news is a different one: the editor will
 * not reach for the local engine by itself. The high tier has nothing to add.
 *
 * Display only — the tier never rewrites a route, and a provider the user
 * pinned stays pinned (§3.3).
 *
 * @param {string} [tier] `PERFORMANCE_TIER.*`
 * @returns {string|null} an i18n key present in both dictionaries
 */
export function editorTierHintKey(tier) {
  if (tier === PERFORMANCE_TIER.MID || tier === PERFORMANCE_TIER.UNKNOWN) {
    return "localBudget.clamped";
  }
  if (tier === PERFORMANCE_TIER.LOW) {
    return "editor.performanceTier.cloudDefault";
  }
  return null;
}

/**
 * Builds the `paint` function injected into `engine.aiRepaintPixelSelection`.
 *
 * The engine handles crop/mask/composite; this only decides who paints the
 * cropped pixels:
 *  - chat: send RPC.GENERATE to the host chat page and return its first image
 *  - api: call the configured image provider via repaintLayer
 *  - unavailable: no paint (caller already surfaced the error)
 *
 * @returns {null | (input: { dataUrl: string, maskDataUrl: string, width: number, height: number, prompt: string }) =>
 *   Promise<string | null | undefined>}
 */
export function makeSelectionRepaintPaint(
  {
    route,
    nodeId,
    settings,
    providerId,
    modelId,
    providers,
    routeId = MODEL_ROUTE_ID.REPAINT,
    platform = PLATFORM_TARGET.CHATGPT,
    onStatus,
    shouldStop,
  },
  {
    callHostImpl = callHost,
    loadRepaintLayer = () => import("../../editor/layer_repaint.js"),
  } = {},
) {
  if (route.route === "chat") {
    return async ({ dataUrl, prompt }) => {
      if (shouldStop?.()) throw new Error("stopped");
      const result = await callHostImpl(
        RPC.GENERATE,
        {
          nodeId,
          prompt,
          images: [dataUrl],
          timeoutMs: settings.timeoutMs,
          settleMs: settings.settleMs,
          autoScroll: settings.autoScroll,
        },
        {
          timeout: settings.timeoutMs + 30000,
          platform: route.platform ?? platform,
        },
      );
      if (shouldStop?.()) throw new Error("stopped");
      return result?.images?.[0] ?? null;
    };
  }
  if (route.route === "api") {
    return async ({ dataUrl, maskDataUrl, width, height, prompt }) => {
      const { repaintLayer } = await loadRepaintLayer();
      return repaintLayer({
        dataUrl,
        maskDataUrl,
        width,
        height,
        prompt,
        providerId,
        modelId,
        // A user's own pick locks to exactly that provider/model pair; without
        // one the resolved chain travels, so the action may degrade.
        providers: providerId ? undefined : providers,
        routeId,
        shouldStop,
        onStatus,
      });
    };
  }
  return null;
}

/**
 * Produces the alpha matte for a picture, running on-device AI local model.
 *
 * Runs BiRefNet/RMBG locally on WebGPU/WASM with progress reporting. Local
 * matting is the only path — the bgsub.com background-service fallback was
 * removed when Mask moved fully on-device.
 *
 * Returns the matting result whole (`{blob, refinement}`): a cutout whose edge
 * refinement was skipped on a large picture is a different fact about the
 * picture than one that was refined, and dropping it here would strand the
 * only place that can say so.
 */
async function matteFor(imageDataUrl, onProgress) {
  try {
    const { isLocalMattingSupported, runLocalMatting } =
      await import("../../editor/local_matting.js");
    if (isLocalMattingSupported()) {
      const blob = dataUrlToBlob(imageDataUrl);
      const bitmap = await createImageBitmap(blob);
      try {
        return await runLocalMatting(bitmap, { onProgress });
      } finally {
        bitmap.close?.();
      }
    }
  } catch (err) {
    console.warn("Local matting failed:", err);
  }
  throw new Error("matting:localUnsupported");
}

/**
 * Says so when the matte came back with its edge refinement skipped.
 *
 * The skip is not a failure — the cutout is there, its edge is just the
 * model's own — so it must not go through the mask error surface, which shows
 * a failure in red. It goes through the region hint instead, the same channel
 * `editor.objectSelect.nothing` uses to report what an operation actually
 * produced. There is no way to say *why* the picture was too large: the hint
 * carries a key, not a message with values in it.
 */
function reportRefinementSkipped(engine, refinement, tooLargeCode) {
  if (refinement?.reason !== tooLargeCode) return;
  engine?.setRegionHint?.("editor.matting.refineSkipped");
}

export function useEditorRaster({
  engine,
  selected,
  lasso,
  pendingObjectStroke,
  sourceWorkflowNodeId,
  onMaterializeGeneratedOutput,
}) {
  const [maskBusy, setMaskBusy] = useState(false);
  const [maskError, setMaskError] = useState(false);
  /** Matting phase and download progress, or null when idle. */
  const [maskProgress, setMaskProgress] = useState(null);
  /** A user-confirmed download is required before a local matting action runs. */
  const [mattingDownload, setMattingDownload] = useState(null);
  const [repaintBusy, setRepaintBusy] = useState(false);
  /** AI repaint of the pixel selection is running (chat or API route). */
  const [selectionRepaintBusy, setSelectionRepaintBusy] = useState(false);
  /** Which stage a running repaint is at, for the button's label. */
  const [lassoBusy, setLassoBusy] = useState(false);
  /**
   * What a running repaint is doing: submitting, waiting for a managed local
   * backend that is booting, or degrading to the next candidate. The busy
   * overlay reads it, so a cold start is visible instead of a silent wait.
   */
  const [repaintStatus, setRepaintStatus] = useState(null);
  /**
   * The tier in force while the editor is open, kept in step with the settings
   * key so a pin changed in another surface shows up here. It only ever drives
   * copy: the routing answer comes from the resolver, not from a boolean here.
   */
  const [performanceTier, setPerformanceTier] = useState(() =>
    getPerformanceTier(),
  );
  useEffect(
    () =>
      onSettingChange(PERFORMANCE_TIER_KEY, () =>
        setPerformanceTier(getPerformanceTier()),
      ),
    [],
  );
  const performanceTierHintKey = editorTierHintKey(performanceTier.tier);
  const [upscaleBusy, setUpscaleBusy] = useState(false);
  const [upscaleProgress, setUpscaleProgress] = useState(null);
  const [retouchBusy, setRetouchBusy] = useState(false);
  /**
   * Why the last retouch produced nothing: a code the editor turns into copy.
   *
   * Kept with the sequence below rather than as a bare code, because the editor
   * shows it through an effect keyed on the value: setting the same code twice
   * in a row is not a state change, so the second failure of the same kind
   * would toast nothing at all. The sequence makes every failure its own event.
   */
  const [retouchFailure, setRetouchFailure] = useState(null);
  const retouchError = retouchFailure?.code ?? null;
  const retouchErrorSeq = retouchFailure?.seq ?? 0;
  const reportRetouchError = useCallback((code) => {
    setRetouchFailure((current) => nextRetouchFailure(current, code));
  }, []);

  const emitGeneratedOutput = async (
    {
      dataUrl,
      operation,
      parameters,
      scenePatch,
      sourceSceneNodeId,
      sourceSnapshot,
    },
    outputSink,
  ) => {
    if (typeof outputSink !== "function") {
      throw new Error("generatedOutputSinkMissing");
    }
    const result = createEditorGeneratedOutput({
      dataUrl,
      operation,
      parameters,
      scenePatch,
      sourceSceneNodeId,
      sourceSnapshot,
      sourceWorkflowNodeId,
    });
    await outputSink(result);
    return result;
  };

  const ensureMattingModel = async (resume) => {
    const { isModelCached } = await import("../../editor/local_matting.js");
    if (await isModelCached()) return true;
    setMattingDownload({ phase: "required", progress: 0, resume });
    return false;
  };

  const downloadMattingModel = async () => {
    const pending = mattingDownload;
    if (!pending || !["required", "failed"].includes(pending.phase))
      return false;
    setMattingDownload({ ...pending, phase: "downloading", progress: 0 });
    try {
      const { downloadModel } = await import("../../editor/local_matting.js");
      await downloadModel(null, {
        onProgress: ({ phase, loaded, total }) => {
          if (phase !== "downloading") return;
          const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
          setMattingDownload((current) =>
            current ? { ...current, phase: "downloading", progress } : current,
          );
        },
      });
      setMattingDownload({ ...pending, phase: "running", progress: 100 });
      const completed = await pending.resume();
      if (completed === false) {
        setMattingDownload({ ...pending, phase: "failed", progress: 0 });
        return false;
      }
      setMattingDownload(null);
      return true;
    } catch (error) {
      console.error("Local matting model download failed", error);
      setMattingDownload({ ...pending, phase: "failed", progress: 0 });
      return false;
    }
  };

  const cancelMattingModelDownload = () => setMattingDownload(null);

  const inFlightAbortRef = useRef(null);

  const cancelAiGeneration = useCallback(() => {
    if (inFlightAbortRef.current) {
      inFlightAbortRef.current.abort();
      inFlightAbortRef.current = null;
    }
    setRepaintBusy(false);
    setSelectionRepaintBusy(false);
    setUpscaleBusy(false);
    setMaskBusy(false);
    setLassoBusy(false);
    setRepaintStatus(null);
    setUpscaleProgress(null);
    setMaskProgress(null);
  }, []);

  /**
   * Runs local on-device matting on the selected image layer — always the
   * untouched original, never the masked/composited version — and attaches
   * the returned matte.
   *
   * Can be called repeatedly: each run clears the previous mask first so the
   * fresh matting result is applied to a clean slate. The matte's alpha
   * channel drives the mask directly (opaque = keep, transparent = erase).
   */
  const removeBackground = async (modelReady = false) => {
    if (!engine || maskBusy) return false;
    if (!selected) {
      // Auto Mask is a one-click tool: without a layer to cut out it has
      // nothing to act on, so say so instead of swallowing the click.
      engine.setRegionHint?.("editor.region.needImage");
      return false;
    }
    if (
      !modelReady &&
      !(await ensureMattingModel(() => removeBackground(true)))
    )
      return false;
    setMaskBusy(true);
    setMaskError(false);
    setMaskProgress(null);
    try {
      const { MATTE_REFINE_TOO_LARGE } =
        await import("../../editor/local_matting.js");
      let image = engine.exportNodePng(selected.id);
      if (!image && selected.dataUrl) image = selected.dataUrl;
      if (!image && selected.src) image = selected.src;
      if (!image) throw new Error("bitmapMissing");

      const { blob, refinement } = await matteFor(image, setMaskProgress);
      const applied = await engine.applyMask(selected.id, blob);
      if (!applied) throw new Error("maskDiscarded");
      reportRefinementSkipped(engine, refinement, MATTE_REFINE_TOO_LARGE);
      return true;
    } catch (err) {
      console.error("removeBackground error:", err);
      setMaskError(repaintFailureCode(err));
      return false;
    } finally {
      setMaskProgress(null);
      setMaskBusy(false);
    }
  };

  /**
   * Applies (or discards) a finished lasso polygon. `eraseInside` cuts the
   * polygon out of the image; `keepInside` cuts everything around it.
   */
  const runLasso = async (mode) => {
    if (!engine || lassoBusy) return;
    setLassoBusy(true);
    try {
      await engine.applyLasso(mode);
    } finally {
      setLassoBusy(false);
    }
  };

  /**
   * Cuts out whatever the lasso encloses, using the model rather than the
   * polygon itself.
   *
   * `keepInside` already crops to the drawn shape, which asks the user to
   * trace the subject exactly. This asks them only to say roughly where it is:
   * the polygon bounds what the model may consider, and the model finds the
   * actual edge inside it.
   *
   * The lasso records document coordinates; the model works in the layer's own
   * pixels, so the polygon is rebased onto the node before it goes anywhere.
   */
  /**
   * Cuts out what a selection encloses, using the model rather than the shape.
   *
   * Both the lasso and a drawn region land here: the shape says which object
   * was meant and bounds what the model may consider, and the model finds the
   * actual edge inside it. Tracing precisely is the thing this saves.
   *
   * `toLayerSelection` receives the layer and returns the selection in that
   * layer's own pixels — selections are recorded in document coordinates, and
   * skipping the rebase puts the cutout somewhere else entirely.
   */
  /**
   * What the model is told to do with the hole a Remove leaves behind.
   *
   * Not user-visible copy — it is the instruction sent to the image model, and
   * it stays in English because that is what the models were trained on.
   */
  const REMOVE_FILL_INSTRUCTION =
    "The transparent area has been erased. Reconstruct it from the " +
    "surrounding pixels so the result looks untouched — match the skin, " +
    "texture, lighting and grain around it. Do not add any new object.";

  /**
   * Runs a scribble from Object Selection or Remove.
   *
   * Both mean "the thing under this stroke": the polygon bounds what the model
   * may consider and the model finds the actual edge inside it. Select stops
   * with the outline installed; remove goes on to cut those pixels out and ask
   * the model to close the gap, which is why it reuses the very same selection
   * rather than computing a second one.
   */
  /**
   * The Remove brush: paint over a blemish, get the background back.
   *
   * No detection happens here — the band the brush covered is the whole input,
   * which is what separates this from Object Selection. The hole is punched
   * into a scratch canvas and never committed: it exists only to tell the
   * model where to paint, so a failed call leaves the layer exactly as it was
   * rather than stranding a transparent gap in the picture.
   */
  const runRemoveBrush = async (nodeId, bitmap, localPoints, diameter) => {
    const scratch = document.createElement("canvas");
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    const ctx = scratch.getContext("2d");
    if (!ctx) throw new Error("noContext");
    ctx.drawImage(bitmap, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = Math.max(1, diameter);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (localPoints.length === 1) {
      // A tap still has to remove something: give it the brush's footprint.
      ctx.beginPath();
      ctx.arc(
        localPoints[0].x,
        localPoints[0].y,
        Math.max(1, diameter / 2),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else {
      ctx.beginPath();
      localPoints.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }

    const scratchDataUrl = scratch.toDataURL("image/png");
    let painted;
    const settings = useDesignStore.getState().settings;

    // This legacy removal operation sends its prepared pixels to the host chat.
    try {
      const result = await callHost(
        RPC.GENERATE,
        {
          nodeId,
          prompt: REMOVE_FILL_INSTRUCTION,
          images: [scratchDataUrl],
          timeoutMs: settings.timeoutMs,
          settleMs: settings.settleMs,
          autoScroll: settings.autoScroll,
        },
        {
          timeout: settings.timeoutMs + 30000,
          platform: PLATFORM_TARGET.CHATGPT,
        },
      );
      painted = result?.images?.[0];
    } catch (hostErr) {
      console.warn("host generation failed, trying api repaint", hostErr);
      try {
        const { repaintLayer } = await import("../../editor/layer_repaint.js");
        painted = await repaintLayer({
          dataUrl: scratchDataUrl,
          prompt: REMOVE_FILL_INSTRUCTION,
        });
      } catch (repaintErr) {
        console.warn(
          "api repaint failed, falling back to local inpainting",
          repaintErr,
        );
        // Pure local inpaint fallback
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = bitmap.width;
        srcCanvas.height = bitmap.height;
        srcCanvas.getContext("2d").drawImage(bitmap, 0, 0);

        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = bitmap.width;
        maskCanvas.height = bitmap.height;
        const maskCtx = maskCanvas.getContext("2d");
        maskCtx.lineWidth = Math.max(2, diameter);
        maskCtx.lineCap = "round";
        maskCtx.lineJoin = "round";
        maskCtx.strokeStyle = "#ffffff";
        maskCtx.fillStyle = "#ffffff";
        if (localPoints.length === 1) {
          maskCtx.beginPath();
          maskCtx.arc(
            localPoints[0].x,
            localPoints[0].y,
            Math.max(1, diameter / 2),
            0,
            Math.PI * 2,
          );
          maskCtx.fill();
        } else {
          maskCtx.beginPath();
          localPoints.forEach((pt, idx) => {
            if (idx === 0) maskCtx.moveTo(pt.x, pt.y);
            else maskCtx.lineTo(pt.x, pt.y);
          });
          maskCtx.stroke();
        }

        const { inpaintLocalImage } =
          await import("../../editor/local_inpaint.js");
        painted = inpaintLocalImage(
          srcCanvas,
          maskCanvas,
          Math.max(4, Math.round(diameter / 2)),
        );
      }
    }

    if (!painted) throw new Error("removeFailed");
    const replaced = await engine.replaceNodeBitmap(nodeId, painted, {
      resetCrop: true,
    });
    if (!replaced) throw new Error("removeDiscarded");
  };

  const runObjectStroke = async ({
    nodeId,
    points,
    intent,
    size,
    modelReady = false,
  }) => {
    const node = engine
      ?.getDocument()
      ?.nodes.find((entry) => entry.id === nodeId);
    if (!engine || !node) return;
    if (intent !== "remove" && !modelReady) {
      const resume = () =>
        runObjectStroke({ nodeId, points, intent, size, modelReady: true });
      if (!(await ensureMattingModel(resume))) return;
    }
    setLassoBusy(true);
    setMaskError(false);
    setMaskProgress(null);
    try {
      const source = engine.exportNodePng(nodeId) ?? node.dataUrl ?? node.src;
      if (!source) throw new Error("bitmapMissing");
      const bitmap = await createImageBitmap(dataUrlToBlob(source));
      try {
        // The stroke was recorded in document units; the model works in the
        // layer's own pixels, and skipping the rebase looks at the wrong part
        // of the picture entirely.
        const scaleX = bitmap.width / (node.width || bitmap.width);
        const scaleY = bitmap.height / (node.height || bitmap.height);
        const local = points.map(([x, y]) => ({
          x: (x - node.x) * scaleX,
          y: (y - node.y) * scaleY,
        }));
        if (intent === "remove") {
          engine.setRegionHint("editor.remove.working");
          await runRemoveBrush(nodeId, bitmap, local, (size ?? 48) * scaleX);
          engine.setRegionHint(null);
          return;
        }
        engine.setRegionHint("editor.objectSelect.working");
        const { runRegionMatting, MATTE_REFINE_TOO_LARGE } =
          await import("../../editor/local_matting.js");
        const { blob: matte, refinement } = await runRegionMatting(
          bitmap,
          { points: local },
          { onProgress: setMaskProgress },
        );
        const { selectionFromMatte } =
          await import("../../editor/pixel_selection.js");
        const selection = await selectionFromMatte(matte, node);
        if (!selection) {
          // A whole model run that produces no selection is a failure the
          // user must see, not guidance that may fade in a breath.
          engine.setRegionHint("editor.objectSelect.nothing", "error");
          return;
        }
        const mode =
          pendingObjectStroke.mode ?? engine.getSelectionMode?.() ?? "replace";
        const baseSelection =
          pendingObjectStroke.baseSelection ??
          (mode === "replace" ? null : engine.getPixelSelection?.());
        if (mode !== "replace" && baseSelection) {
          engine.combinePixelSelection(baseSelection, selection, mode);
        } else {
          engine.setPixelSelection(selection);
        }
        const feather = engine.getSelectionFeather?.() ?? 0;
        if (feather > 0) {
          engine.featherPixelSelection?.(feather);
        }
        engine.commit?.("editor.history.entry.objectSelection");
        engine.setRegionHint(null);
        reportRefinementSkipped(engine, refinement, MATTE_REFINE_TOO_LARGE);
      } finally {
        bitmap.close?.();
      }
    } catch (err) {
      // These run for seconds and can fail on model configuration rather than
      // on anything the user did, so the reason goes to the status pill — a
      // line in a panel they may not even have open is not a failure report.
      console.error("object stroke failed", err);
      engine.setRegionHint(
        intent === "remove"
          ? "editor.remove.failed"
          : "editor.objectSelect.failed",
        "error",
      );
      setMaskError(repaintFailureCode(err));
    } finally {
      setMaskProgress(null);
      setLassoBusy(false);
    }
  };

  /**
   * One-click Select Subject: runs the full-image cutout model and installs
   * the result as a pixel selection, so the user can delete, copy or refine
   * the subject without tracing it.
   */
  const selectSubject = async (node, modelReady = false) => {
    if (!engine) return;
    const targetNode =
      node?.kind === "image"
        ? node
        : engine.getSelected()?.kind === "image"
          ? engine.getSelected()
          : engine.getDocument()?.nodes?.find((n) => n.kind === "image");
    if (!targetNode) {
      engine.setRegionHint?.("editor.region.needImage");
      return;
    }
    if (
      !modelReady &&
      !(await ensureMattingModel(() => selectSubject(targetNode, true)))
    )
      return;
    setLassoBusy(true);
    setMaskError(false);
    setMaskProgress(null);
    engine.setRegionHint?.("editor.objectSelect.working");
    try {
      const source =
        engine.exportNodePng(targetNode.id) ??
        targetNode.dataUrl ??
        targetNode.src;
      if (!source) throw new Error("bitmapMissing");
      const bitmap = await createImageBitmap(dataUrlToBlob(source));
      try {
        const { runLocalMatting, MATTE_REFINE_TOO_LARGE } =
          await import("../../editor/local_matting.js");
        const { blob: matte, refinement } = await runLocalMatting(bitmap, {
          onProgress: setMaskProgress,
        });
        const { selectionFromMatte } =
          await import("../../editor/pixel_selection.js");
        const selection = await selectionFromMatte(matte, targetNode);
        if (!selection) {
          engine.setRegionHint?.("editor.objectSelect.nothing");
          return;
        }
        engine.setPixelSelection(selection);
        engine.setRegionHint?.(null);
        reportRefinementSkipped(engine, refinement, MATTE_REFINE_TOO_LARGE);
      } finally {
        bitmap.close?.();
      }
    } catch (err) {
      console.error("select subject failed", err);
      engine.setRegionHint?.("editor.objectSelect.failed");
      setMaskError(repaintFailureCode(err));
    } finally {
      setMaskProgress(null);
      setLassoBusy(false);
    }
  };

  // The engine parks a finished scribble and notifies; taking it here keeps
  // the model call, its busy state and its error out of the engine. Cleared
  // before the run so a re-render mid-flight cannot start it twice.
  useEffect(() => {
    if (!pendingObjectStroke) return;
    engine?.clearPendingObjectStroke?.();
    void runObjectStroke(pendingObjectStroke);
    // runObjectStroke is redefined every render; the stroke identity is what
    // decides whether there is work to do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingObjectStroke]);

  const runSelectionCutout = async (
    node,
    toLayerSelection,
    onDone,
    modelReady = false,
  ) => {
    if (!engine || !node || lassoBusy) return;
    if (!modelReady) {
      const resume = () =>
        runSelectionCutout(node, toLayerSelection, onDone, true);
      if (!(await ensureMattingModel(resume))) return;
    }
    setLassoBusy(true);
    setMaskError(false);
    setMaskProgress(null);
    try {
      const source = engine.exportNodePng(node.id) ?? node.dataUrl ?? node.src;
      if (!source) throw new Error("bitmapMissing");
      const bitmap = await createImageBitmap(dataUrlToBlob(source));
      try {
        const scaleX = bitmap.width / node.width;
        const scaleY = bitmap.height / node.height;
        const selection = toLayerSelection({ node, scaleX, scaleY });

        const { runRegionMatting, MATTE_REFINE_TOO_LARGE } =
          await import("../../editor/local_matting.js");
        const { blob: matte, refinement } = await runRegionMatting(
          bitmap,
          selection,
          { onProgress: setMaskProgress },
        );
        onDone?.();
        const applied = await engine.applyMask(node.id, matte);
        if (!applied) throw new Error("maskDiscarded");
        reportRefinementSkipped(engine, refinement, MATTE_REFINE_TOO_LARGE);
      } finally {
        bitmap.close?.();
      }
    } catch (err) {
      console.error("selection cutout failed", err);
      setMaskError(repaintFailureCode(err));
    } finally {
      setMaskProgress(null);
      setLassoBusy(false);
    }
  };

  const runLassoCutout = async () => {
    if (!lasso?.pending) return;
    const node = engine
      ?.getDocument()
      ?.nodes.find((n) => n.id === lasso.nodeId);
    await runSelectionCutout(
      node,
      ({ scaleX, scaleY }) => ({
        points: lasso.points.map(([x, y]) => ({
          x: (x - node.x) * scaleX,
          y: (y - node.y) * scaleY,
        })),
      }),
      () => engine?.cancelLasso(),
    );
  };

  /**
   * Sends one layer to the provider and emits a generated image candidate.
   *
   * The layer travels as its own pixels rather than the flattened page: the
   * user asked to change this layer, and handing over everything under it
   * would invite the model to change that too.
   *
   * `providerId`/`modelId` are the user's own per-action pick from the panel;
   * without them the Design editor uses the local Qwen Image 2.1 route.
   */
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

  /**
   * Outpaints a layer: composites its bitmap into a larger canvas (the
   * drag-grown rect) whose new margin is primed with a continuation of the
   * picture, asks the model to fill that border, then merges the answer — the
   * original region from the original bytes, only the margin from the model —
   * and emits it with the node/document growth patch required to place it in a
   * candidate document.
   *
   * Shares Repaint's route-chain resolution and its busy flag, so the two
   * never run at once: there is no per-action picker here, so the shared route
   * decides and the chain may degrade from local to a configured cloud
   * candidate.
   */
  const runOutpaint = async (node, rect, prompt) => {
    if (!engine || !node || !rect || repaintBusy) return;
    setRepaintBusy(true);
    setMaskError(false);
    setRepaintStatus(null);
    const stopBackendWatch = onLocalBackendStarting(() =>
      setRepaintStatus({ phase: "starting" }),
    );
    let abortController = null;
    try {
      const source = engine.exportNodePng(node.id) ?? node.dataUrl ?? node.src;
      if (!source) throw new Error("bitmapMissing");
      const sourceSnapshot = engine.serialise?.();

      const bitmap = await decodeImageSource(source);
      // Saliency can only widen the user's rect: if the subject would be cut
      // or pinched, grow the rect around it (plus the minimum margin) before
      // planning. No usable map -> `effectiveRect` is the submitted rect and
      // every downstream byte is exactly what it was before saliency existed.
      const effectiveRect = protectOutpaintRect(bitmap, node, rect);
      const plan = compositePlan(
        {
          ...node,
          bitmapWidth: bitmap.naturalWidth ?? bitmap.width,
          bitmapHeight: bitmap.naturalHeight ?? bitmap.height,
        },
        effectiveRect,
      );
      // Read the source at the plan's own resolution: the output cap may have
      // scaled the original down, and a natural-size read of a large photo is a
      // many-hundred-megabyte buffer for what is at most a 2048px request.
      const sourceRgba = readImageRgbaAt(
        bitmap,
        plan.drawWidth,
        plan.drawHeight,
      );
      // Send the grown margin primed with a continuation of the picture instead
      // of empty: the model refines a scene that is already there rather than
      // inventing one for a hole, which is what the colour shift at the join
      // and the "pasted-on" look came from.
      const composite = rgbaToPngDataUrl(
        primeOutpaintMargin(sourceRgba, {
          sourceWidth: plan.drawWidth,
          sourceHeight: plan.drawHeight,
          plan,
          mode: DEFAULT_OUTPAINT_PRIME_MODE,
        }),
        plan.width,
        plan.height,
      );

      // No per-action picker on this path, so the shared route decides: a
      // stored choice locks the chain, the built-in local default does not.
      const chain = await editorRouteChain(MODEL_ROUTE_ID.OUTPAINT);
      const primary = chain[0] ?? null;

      // Readiness answers for the whole chain, so a stopped local engine
      // degrades to a configured cloud candidate instead of refusing the edit.
      const hasApiProvider = chain.length > 0;
      const route = resolveRepaintRoute({
        hasApiProvider,
        environment: getEnvironment(),
        platform: PLATFORM_TARGET.CHATGPT,
        providerId: primary?.providerId,
        modelId: primary?.modelId,
        // Inherit the shared API default without overriding saved model routes.
        executionMode: undefined,
      });

      const instruction = prompt?.trim()
        ? `${OUTPAINT_INSTRUCTION}\n\n${prompt.trim()}`
        : OUTPAINT_INSTRUCTION;
      abortController = new AbortController();
      inFlightAbortRef.current = abortController;

      let painted;
      let usedProvider = primary;
      if (route.route === "api") {
        const { repaintLayer } = await import("../../editor/layer_repaint.js");
        painted = await repaintLayer({
          dataUrl: composite,
          prompt: instruction,
          providers: chain,
          routeId: MODEL_ROUTE_ID.OUTPAINT,
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
        const settings = useDesignStore.getState().settings;
        const result = await callHost(
          RPC.GENERATE,
          {
            nodeId: node.id,
            prompt: instruction,
            images: [composite],
            timeoutMs: settings.timeoutMs,
            settleMs: settings.settleMs,
            autoScroll: settings.autoScroll,
          },
          { timeout: settings.timeoutMs + 30000, platform: route.platform },
        );
        painted = result?.images?.[0];
      } else {
        setMaskError("noRepaintRouteAvailable");
        return;
      }

      if (!painted) throw new Error("noResult");

      const paintedBitmap = await decodeImageSource(painted);
      if (!paintedBitmap) throw new Error("noResult");

      // The answer only supplies the grown margin: the region the user did not
      // ask to regenerate is written back from the original bytes, and the join
      // is feathered, so the model's own re-render of that region cannot show up
      // as a tone line across the boundary.
      const finalComposite = rgbaToPngDataUrl(
        compositeOutpaintResult(
          readImageRgbaAt(paintedBitmap, plan.width, plan.height),
          sourceRgba,
          {
            plan,
            seam: DEFAULT_OUTPAINT_SEAM,
            sourceWidth: plan.drawWidth,
            sourceHeight: plan.drawHeight,
          },
        ),
        plan.width,
        plan.height,
      );
      return await emitGeneratedOutput(
        {
          dataUrl: finalComposite,
          operation: EDITOR_GENERATED_OPERATION.OUTPAINT,
          parameters: {
            prompt: prompt?.trim() ?? "",
            platform: route.platform ?? PLATFORM_TARGET.CHATGPT,
            providerId: usedProvider?.providerId,
            modelId: usedProvider?.modelId,
          },
          scenePatch: createOutpaintScenePatch(sourceSnapshot, effectiveRect),
          sourceSceneNodeId: node.id,
          sourceSnapshot,
        },
        onMaterializeGeneratedOutput,
      );
    } catch (err) {
      console.error("layer outpaint failed", err);
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

  /** The same, bounded by a region the user drew with the AI select tool. */
  const runRegionCutout = async (region) => {
    const doc = engine?.getDocument();
    if (!doc || !region) return;
    // A region names its host image outright — no reverse lookup needed —
    // and its box is already in that image's pixels.
    const host = regionHost(doc, region);
    if (!host) {
      engine?.setRegionHint?.("editor.region.needImage");
      return;
    }
    await runSelectionCutout(host, ({ scaleX, scaleY }) => {
      if (Array.isArray(region.points) && region.points.length > 0) {
        return {
          points: region.points.map((point) => ({
            x: point.x * scaleX,
            y: point.y * scaleY,
          })),
        };
      }
      return {
        x: region.x * scaleX,
        y: region.y * scaleY,
        width: region.width * scaleX,
        height: region.height * scaleY,
      };
    });
  };

  /**
   * AI repaint of the current pixel selection: crop the selection, run it
   * through the route-selected painter (API by default, explicit chat when
   * selected), composite the result back clipped to the selection
   * outline. The painter is injected into the engine, so the engine stays
   * free of chat/session dependencies.
   */
  const runSelectionRepaint = async (
    prompt,
    {
      platform = PLATFORM_TARGET.CHATGPT,
      executionMode,
      providerId,
      modelId,
    } = {},
  ) => {
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

      const done = await engine.aiRepaintPixelSelection?.({
        prompt: prompt.trim(),
        providerId: primary?.providerId,
        modelId: primary?.modelId,
        paint,
      });
      if (done === false) setMaskError(true);
    } catch (err) {
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

  /**
   * Produces a high-resolution candidate for the selected image layer.
   */
  const upscaleImage = async (scaleOrOptions = 2) => {
    let scale = 2;
    let modelId = null;
    if (typeof scaleOrOptions === "number") {
      scale = scaleOrOptions;
    } else if (typeof scaleOrOptions === "string") {
      modelId = scaleOrOptions;
      scale = scaleOrOptions.includes("4x") ? 4 : 2;
    } else if (typeof scaleOrOptions === "object" && scaleOrOptions !== null) {
      scale = typeof scaleOrOptions.scale === "number" ? scaleOrOptions.scale : 2;
      modelId = scaleOrOptions.modelId ?? null;
    }

    const target =
      selected ||
      engine?.getSelected?.() ||
      engine?.getDocument?.()?.nodes?.find((n) => n.kind === "image");
    if (!engine || upscaleBusy || !target) return;
    setUpscaleBusy(true);
    setUpscaleProgress(null);
    const abortController = new AbortController();
    inFlightAbortRef.current = abortController;
    try {
      const sourceSnapshot = engine.serialise?.();
      let image = engine.exportNodePng?.(target.id);
      if (!image && target.dataUrl) image = target.dataUrl;
      if (!image && target.src) image = target.src;
      if (!image && target.imageId) {
        const bmp = engine.getNodeBitmap?.(target);
        if (bmp) image = bmp;
      }
      if (!image) throw new Error("bitmapMissing");

      const bitmap =
        image instanceof HTMLImageElement ||
        image instanceof HTMLCanvasElement ||
        (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
          ? image
          : await decodeImageSource(image);
      if (!bitmap) throw new Error("bitmapDecodeFailed");

      const { runLocalUpscale } = await import("../../editor/local_upscale.js");
      const blob = await runLocalUpscale(bitmap, {
        scale,
        modelId,
        onProgress: (p) => setUpscaleProgress(p),
        shouldStop: () => abortController.signal.aborted,
      });

      if (!blob) throw new Error("upscaleFailed");
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      return await emitGeneratedOutput(
        {
          dataUrl,
          operation: EDITOR_GENERATED_OPERATION.UPSCALE,
          parameters: { scale, modelId },
          scenePatch: { type: EDITOR_SCENE_PATCH.REPLACE_BITMAP },
          sourceSceneNodeId: target.id,
          sourceSnapshot,
        },
        onMaterializeGeneratedOutput,
      );
    } catch (err) {
      console.error("upscaleImage error:", err);
      setMaskError(repaintFailureCode(err));
    } finally {
      if (inFlightAbortRef.current === abortController) {
        inFlightAbortRef.current = null;
      }
      setUpscaleProgress(null);
      setUpscaleBusy(false);
    }
  };

  /**
   * Portrait retouch of the selected image layer: skin smoothing, blemish
   * removal and a skin brightening, as one undoable candidate.
   *
   * The engine is pure JS over typed arrays, so it is loaded on demand like the
   * other engines — a build that never retouches never pays for it. Unlike
   * upscale this is not a model run, so there is no progress phase: the pixels
   * go in and come back in one turn, and the button's busy state is the whole
   * feedback.
   *
   * The layer's own bitmap is the source, not a rendered export: the retouch
   * edits pixels, and a render would bake the layer's adjustments into the copy
   * that then replaces it.
   *
   * @param {Record<string, number>} strengths percent per step, from the popover
   */
  const retouchImage = async (strengths) => {
    const target =
      selected ||
      engine?.getSelected?.() ||
      engine?.getDocument?.()?.nodes?.find((n) => n.kind === "image");
    if (!engine || retouchBusy) return null;
    if (!target) {
      reportRetouchError("noImage");
      return null;
    }
    // Every step at zero would return an untouched copy and a candidate node
    // that looks identical: refuse rather than write a no-op into history.
    if (!hasRetouchWork(strengths)) return null;

    setRetouchBusy(true);
    setRetouchFailure(null);
    try {
      // Let the busy state paint before the synchronous block below, or the
      // click has no feedback at all while it runs.
      await nextPaint();
      // Built inside the guard: a strength the panel could not produce (an
      // out-of-range percent, an unknown step) must come out as the toast
      // below, not as an unhandled rejection — the caller is `void
      // retouchImage(...)`.
      const options = retouchOptions(strengths);
      const bitmap = engine.getNodeBitmap?.(target);
      if (!bitmap) throw new Error("bitmapMissing");
      const source = readBitmapSize(bitmap);
      const tooLarge = retouchBudgetError(source.width, source.height);
      if (tooLarge) {
        reportRetouchError(tooLarge);
        return null;
      }

      const sourceSnapshot = engine.serialise?.();
      const { rgba, width, height } = readImageRgba(bitmap);
      const { applyPortraitRetouch } =
        await import("../../editor/portrait_retouch.js");
      const retouched = applyPortraitRetouch(rgba, width, height, options);
      return await emitGeneratedOutput(
        {
          dataUrl: rgbaToPngDataUrl(retouched, width, height),
          operation: EDITOR_GENERATED_OPERATION.AI_REPAIR,
          parameters: { portraitRetouch: options },
          scenePatch: { type: EDITOR_SCENE_PATCH.REPLACE_BITMAP },
          sourceSceneNodeId: target.id,
          sourceSnapshot,
        },
        onMaterializeGeneratedOutput,
      );
    } catch (err) {
      // PortraitRetouchError carries a RETOUCH_ERRORS code; anything else is a
      // missing bitmap or a failed encode. Both are visible: a retouch that
      // silently did nothing reads as a broken button.
      console.error("retouchImage error:", err);
      reportRetouchError(err?.code ?? "failed");
      return null;
    } finally {
      setRetouchBusy(false);
    }
  };

  return {
    removeBackground,
    upscaleImage,
    retouchImage,
    runLasso,
    runLassoCutout,
    runRegionCutout,
    runRepaint,
    runOutpaint,
    runSelectionRepaint,
    selectSubject,
    runRemoveBrush,
    runObjectStroke,
    runSelectionCutout,
    maskBusy,
    maskError,
    maskProgress,
    upscaleBusy,
    upscaleProgress,
    retouchBusy,
    retouchError,
    retouchErrorSeq,
    lassoBusy,
    repaintBusy,
    repaintStatus,
    performanceTier,
    performanceTierHintKey,
    selectionRepaintBusy,
    mattingDownload,
    downloadMattingModel,
    cancelMattingModelDownload,
    cancelAiGeneration,
  };
}
