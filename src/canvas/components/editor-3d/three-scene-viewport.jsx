import PropTypes from "prop-types";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { projectSceneToXY } from "../../editor/three-scene-model.js";
import { gridTogglePatch } from "../../editor/three-scene-patch.js";
import { useI18n } from "../../use_i18n.js";
import {
  ICON_STROKE_WIDTH,
  IconExpand,
  IconGrid3x3,
  IconMove,
  IconPerspective,
  IconRotateCcw,
  IconSquare,
} from "../../icons.jsx";
import { resolveThreeSceneDocument } from "./three-scene-document.js";
import ThreeViewGizmo from "./three-view-gizmo.jsx";
import { useThreeControlsInset } from "./use-three-controls-inset.js";

const TOOL_OPTIONS = [
  {
    mode: "translate",
    label: "editor.three.moveTool",
    Icon: IconMove,
    id: "move",
  },
  {
    mode: "rotate",
    label: "editor.three.rotateTool",
    Icon: IconRotateCcw,
    id: "rotate",
  },
  {
    mode: "scale",
    label: "editor.three.scaleTool",
    Icon: IconExpand,
    id: "scale",
  },
];
// Blender keys (G/R/S); W/E stay as the Unity-style aliases for move/rotate.
const KEYBOARD_MODES = {
  g: "translate",
  w: "translate",
  r: "rotate",
  e: "rotate",
  s: "scale",
};
// Blender's view keys: numpad or the digit row, Ctrl for the opposite side.
const VIEW_KEYS = {
  1: ["front", "back"],
  3: ["right", "left"],
  7: ["top", "bottom"],
};
const ORBIT_KEYS = { 4: [-1, 0], 6: [1, 0], 8: [0, 1], 2: [0, -1] };
const DEFAULT_ORIENTATION = [0, 0, 0, 1];
const CLUSTER_BUTTON =
  "rounded-full p-2 transition-all focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#E5B2FF]";

/** Fits its parent so the same renderer works in the editor and in an instance. */
/**
 * What a keydown asks the viewport to do, decided from the surface it
 * arrived on.
 *
 * A camera move is safe wherever the surface may turn, and a 3D instance's
 * read-only hit surface may turn it on purpose — it orbits with a pointer
 * today. The keys that write to the document (the projection toggle) and the
 * ones that re-arm the gizmo stay with an editable frame, and a surface that
 * may not turn at all claims nothing, so a presentation viewer never finds a
 * view snap waiting on their number keys.
 *
 * @param {object} event a keydown event
 * @param {object} surface `{interactive, readOnly, allowReadOnlyInteraction,
 *   xyProjection}`, the props this viewport is running with
 * @returns {{type: "view"|"orbit"|"frame"|"projection"|"toolMode", ...}|null}
 */
export function viewKeyDownAction(event, surface = {}) {
  const {
    interactive = true,
    readOnly = false,
    allowReadOnlyInteraction = false,
    xyProjection = false,
  } = surface;
  if (xyProjection) return null;
  if (event.altKey || event.metaKey) return null;
  // Picked, and either editable or read-only-but-drivable. The runtime
  // answers the same question in cameraInputAllowed before it moves anything.
  const camera = interactive && (allowReadOnlyInteraction || !readOnly);
  if (!camera) return null;
  const editable = interactive && !readOnly;

  // Numpad 1/3/7 and the digit row pick a view; Ctrl looks from behind.
  const digit = /^(?:Numpad|Digit)(\d)$/.exec(event.code)?.[1];
  const view = VIEW_KEYS[digit]?.[event.ctrlKey ? 1 : 0];
  if (view) return { type: "view", view };
  if (editable && digit === "5" && !event.ctrlKey)
    return { type: "projection" };
  if (!event.ctrlKey && ORBIT_KEYS[digit] && event.code.startsWith("Numpad"))
    return { type: "orbit", step: ORBIT_KEYS[digit] };
  if (event.code === "Home") return { type: "frame", focused: false };
  if (["NumpadDecimal", "Period", "KeyF"].includes(event.code))
    return { type: "frame", focused: true };
  if (!editable) return null;
  const mode = KEYBOARD_MODES[event.key?.toLowerCase()];
  if (!mode || event.ctrlKey) return null;
  return { type: "toolMode", mode };
}

export function ThreeSceneViewport({
  doc,
  getDocument = null,
  selectedId = null,
  selectedIds = null,
  resolveAsset = null,
  onSelect = null,
  onPatchNode = null,
  onPatchScene = null,
  onInstanceCameraChange = null,
  onCommit = null,
  onError = null,
  readOnly = false,
  interactive = true,
  inputElement = null,
  allowReadOnlyInteraction = false,
  xyProjection = false,
  /** Controlled gizmo mode. Omit to let the viewport own it. */
  toolMode = null,
  onToolMode = null,
  /** The host renders the tool row (e.g. the 3D top toolbar) when false. */
  showToolGroup = true,
  /**
   * Whether the corner controls (grid, projection, view gizmo) sit in this
   * viewport's bottom-right corner. Hosts hide them on unfocused frames.
   */
  viewControls = true,
  preferProvidedDocument = false,
}) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const controlsRef = useRef(null);
  const runtimeRef = useRef(null);
  const callbacksRef = useRef({});
  const [status, setStatus] = useState("loading");
  const [orientation, setOrientation] = useState(DEFAULT_ORIENTATION);
  const [internalToolMode, setInternalToolMode] = useState("translate");
  const activeToolMode = toolMode ?? internalToolMode;
  const renderedDoc = useMemo(
    () => (xyProjection ? projectSceneToXY(doc) : doc),
    [doc, xyProjection],
  );
  const activeSelectedIds = useMemo(
    () =>
      Array.isArray(selectedIds) ? selectedIds : selectedId ? [selectedId] : [],
    [selectedId, selectedIds],
  );

  callbacksRef.current = {
    doc: renderedDoc,
    getDocument,
    resolveAsset,
    onSelect,
    onPatchNode,
    onPatchScene,
    onInstanceCameraChange,
    onCommit,
    onError,
    selectedId,
    selectedIds: activeSelectedIds,
    readOnly,
    interactive,
    allowReadOnlyInteraction,
    preferProvidedDocument,
    xyProjection,
    toolMode: activeToolMode,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let active = true;
    let runtime = null;

    async function loadRuntime() {
      try {
        const { createThreeSceneRuntime } =
          await import("../../editor/three-scene-runtime.js");
        if (!active) return;
        const current = callbacksRef.current;
        runtime = createThreeSceneRuntime(canvas, {
          inputElement: inputElement ?? canvas,
          allowReadOnlyInteraction: current.allowReadOnlyInteraction,
          interactive: current.interactive,
          readOnly: current.readOnly,
          enableTransform: !current.xyProjection,
          getDocument: () =>
            resolveThreeSceneDocument({
              latestDocument: callbacksRef.current?.doc,
              getDocument: callbacksRef.current?.getDocument,
              preferProvidedDocument:
                callbacksRef.current?.preferProvidedDocument,
              xyProjection: callbacksRef.current?.xyProjection,
              projectToXY: projectSceneToXY,
            }),
          resolveAsset: (node) =>
            callbacksRef.current.resolveAsset?.(node) ?? node.src,
          onSelect: (id, meta) => callbacksRef.current.onSelect?.(id, meta),
          onPatchNode: (id, patch) => {
            const handler = callbacksRef.current.onPatchNode;
            return handler ? handler(id, patch) : false;
          },
          onCommit: () => callbacksRef.current.onCommit?.(),
          onError: (id, failure) => callbacksRef.current.onError?.(id, failure),
          onViewChange: setOrientation,
          onCameraChange: (patch) => {
            const latest = callbacksRef.current;
            if (latest.onInstanceCameraChange) {
              latest.onInstanceCameraChange(patch);
              return;
            }
            latest.onPatchScene?.({ camera: patch });
            latest.onCommit?.();
          },
        });
        runtimeRef.current = runtime;
        const latest = callbacksRef.current;
        runtime.setDocument(latest.doc);
        runtime.setSelectedIds(latest.selectedIds);
        runtime.setToolMode(latest.toolMode);
        runtime.setInputMode({
          readOnly: latest.readOnly,
          interactive: latest.interactive,
          allowReadOnlyInteraction: latest.allowReadOnlyInteraction,
          enableTransform: !latest.xyProjection,
        });
        setStatus("ready");
      } catch (failure) {
        runtime?.dispose();
        if (runtimeRef.current === runtime) runtimeRef.current = null;
        if (!active) return;
        setStatus("error");
        callbacksRef.current.onError?.(null, failure);
      }
    }

    void loadRuntime();
    return () => {
      active = false;
      runtime?.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
    // Rebind only when the selected instance's hit surface changes. Input
    // permissions update in place below; recreating WebGL here loses the
    // first orbit gesture while the asynchronous runtime reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputElement]);

  useEffect(() => runtimeRef.current?.setDocument(renderedDoc), [renderedDoc]);
  useEffect(
    () => runtimeRef.current?.setSelectedIds(activeSelectedIds),
    [activeSelectedIds],
  );
  useLayoutEffect(
    () =>
      runtimeRef.current?.setInputMode({
        readOnly,
        interactive,
        allowReadOnlyInteraction,
        enableTransform: !xyProjection,
      }),
    [readOnly, interactive, allowReadOnlyInteraction, xyProjection],
  );
  useEffect(
    () => runtimeRef.current?.setToolMode(activeToolMode),
    [activeToolMode],
  );

  function selectTool(mode) {
    if (onToolMode) onToolMode(mode);
    else setInternalToolMode(mode);
    canvasRef.current?.focus();
  }

  const scene3d = renderedDoc.scene3d ?? {};
  const gridPlane =
    scene3d.grid?.plane ?? (scene3d.showGrid === false ? "off" : "xy");
  const gridVisible = gridPlane !== "off";
  const projection = scene3d.camera?.projection ?? "orthographic";

  function patchScene(patch) {
    onPatchScene?.(patch);
    onCommit?.();
  }

  const toggleGrid = () => patchScene(gridTogglePatch(scene3d));
  const toggleProjection = () =>
    patchScene({
      camera: {
        projection:
          projection === "perspective" ? "orthographic" : "perspective",
      },
    });

  function handleKeyDown(event) {
    const action = viewKeyDownAction(event, callbacksRef.current);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const runtime = runtimeRef.current;
    if (action.type === "view") runtime?.setView(action.view);
    else if (action.type === "orbit") runtime?.orbitBy(...action.step);
    else if (action.type === "frame") runtime?.frame(action.focused);
    else if (action.type === "projection") toggleProjection();
    else if (action.type === "toolMode") {
      if (onToolMode) onToolMode(action.mode);
      else setInternalToolMode(action.mode);
    }
  }

  callbacksRef.current.handleKeyDown = handleKeyDown;
  useEffect(() => {
    if (!inputElement || !interactive) return undefined;
    const onKeyDown = (event) => callbacksRef.current.handleKeyDown?.(event);
    inputElement.addEventListener("keydown", onKeyDown);
    return () => inputElement.removeEventListener("keydown", onKeyDown);
  }, [inputElement, interactive]);

  const wantControls =
    viewControls &&
    interactive &&
    !readOnly &&
    !xyProjection &&
    status === "ready";
  const controlsInset = useThreeControlsInset(
    frameRef,
    controlsRef,
    wantControls,
  );
  const showControls = wantControls && controlsInset !== null;
  const controls = (
    <div
      ref={controlsRef}
      className="pointer-events-auto flex flex-col items-end gap-1"
    >
      <div className="flex items-center gap-1 rounded-full bg-black/90 p-1 shadow-pop backdrop-blur-md">
        <button
          type="button"
          data-testid="editor-three-grid-toggle"
          aria-label={t(
            gridVisible ? "editor.three.hideGrid" : "editor.three.showGrid",
          )}
          title={t(
            gridVisible ? "editor.three.hideGrid" : "editor.three.showGrid",
          )}
          aria-pressed={gridVisible}
          onClick={toggleGrid}
          className={`${CLUSTER_BUTTON} ${
            gridVisible
              ? "bg-white text-black"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          }`}
        >
          <IconGrid3x3 size={14} strokeWidth={ICON_STROKE_WIDTH} />
        </button>
        <button
          type="button"
          data-testid="editor-three-projection-toggle"
          aria-label={t(
            projection === "perspective"
              ? "editor.three.toOrthographic"
              : "editor.three.toPerspective",
          )}
          title={t(
            projection === "perspective"
              ? "editor.three.toOrthographic"
              : "editor.three.toPerspective",
          )}
          onClick={toggleProjection}
          className={`${CLUSTER_BUTTON} text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100`}
        >
          {projection === "perspective" ? (
            <IconPerspective size={14} strokeWidth={ICON_STROKE_WIDTH} />
          ) : (
            <IconSquare size={14} strokeWidth={ICON_STROKE_WIDTH} />
          )}
        </button>
      </div>
      <ThreeViewGizmo
        orientation={orientation}
        onSnap={(view) => {
          runtimeRef.current?.setView(view);
          canvasRef.current?.focus();
        }}
        t={t}
      />
    </div>
  );

  return (
    <div
      ref={frameRef}
      className="relative h-full min-h-0 w-full overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        data-status={status}
        className="block h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]"
        aria-label={t("editor.three.scene")}
        tabIndex={interactive && !inputElement ? 0 : -1}
        onKeyDown={handleKeyDown}
      />
      {showToolGroup &&
      interactive &&
      !readOnly &&
      !xyProjection &&
      status === "ready" ? (
        <div className="absolute left-3 top-3 z-20 flex gap-1 rounded-xl border border-white/10 bg-neutral-900/95 p-1">
          {TOOL_OPTIONS.map(({ mode, label, Icon, id }) => (
            <button
              key={mode}
              type="button"
              data-testid={`editor-three-tool-${id}`}
              aria-label={t(label)}
              title={t(label)}
              aria-pressed={activeToolMode === mode}
              onClick={() => selectTool(mode)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#E5B2FF] max-md:h-12 max-md:w-12 ${
                activeToolMode === mode
                  ? "bg-[#E5B2FF]/10 text-[#eed0ff]"
                  : "text-neutral-400 hover:bg-white/10 hover:text-neutral-100"
              }`}
            >
              <Icon size={16} strokeWidth={ICON_STROKE_WIDTH} />
            </button>
          ))}
        </div>
      ) : null}
      {showControls ? (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            right: controlsInset.right,
            bottom: controlsInset.bottom,
          }}
        >
          {controls}
        </div>
      ) : null}
      {status === "loading" ? (
        <div
          role="status"
          className={
            xyProjection
              ? "sr-only"
              : "absolute inset-0 flex items-center justify-center bg-neutral-950/60 p-4 text-[11px] text-neutral-400"
          }
        >
          {t("editor.loading")}
        </div>
      ) : null}
      {status === "error" ? (
        <div
          role="alert"
          className={
            xyProjection
              ? "sr-only"
              : "absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-[11px] text-rose-400"
          }
        >
          {t("editor.loadFailed")}
        </div>
      ) : null}
    </div>
  );
}

ThreeSceneViewport.propTypes = {
  doc: PropTypes.object.isRequired,
  getDocument: PropTypes.func,
  selectedId: PropTypes.string,
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  resolveAsset: PropTypes.func,
  onSelect: PropTypes.func,
  onPatchNode: PropTypes.func,
  onPatchScene: PropTypes.func,
  onInstanceCameraChange: PropTypes.func,
  onCommit: PropTypes.func,
  onError: PropTypes.func,
  readOnly: PropTypes.bool,
  interactive: PropTypes.bool,
  inputElement: PropTypes.instanceOf(Element),
  allowReadOnlyInteraction: PropTypes.bool,
  xyProjection: PropTypes.bool,
  toolMode: PropTypes.oneOf(["translate", "rotate", "scale"]),
  onToolMode: PropTypes.func,
  showToolGroup: PropTypes.bool,
  viewControls: PropTypes.bool,
  preferProvidedDocument: PropTypes.bool,
};

export default ThreeSceneViewport;
