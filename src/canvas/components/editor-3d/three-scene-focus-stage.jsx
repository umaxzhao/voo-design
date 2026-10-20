import { getThreeCameraPreviewStyle } from "../../editor/three-camera-preview-frame.js";
import PropTypes from "prop-types";
import { useEffect, useRef, Suspense, lazy } from "react";
import { ICON_STROKE_WIDTH, IconClose, IconBox3 } from "../../icons.jsx";

const ThreeSceneViewport = lazy(() => import("./three-scene-viewport.jsx"));

/**
 * Stage-occupying 3D Focus overlay.
 *
 * Expands the active 3D frame into the full available editor stage area,
 * providing direct access to 3D transform tools, camera orbit/navigation,
 * viewport-corner coordinates/grid controls, and an accessible Exit button.
 */
export default function ThreeSceneFocusStage({
  nodeId,
  title,
  doc,
  getDocument,
  selectedId,
  selectedIds,
  readOnly = false,
  toolMode,
  onToolMode,
  onPatchNode,
  onPatchScene,
  onCommit,
  onSelect,
  resolveAsset,
  onExit,
  t,
}) {
  const pointerActiveRef = useRef(false);

  useEffect(() => {
    const finishPointer = () => {
      pointerActiveRef.current = false;
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;

      // Do not exit if user is editing in an input, textarea, contenteditable, or menu
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable ||
          activeEl.closest?.('[role="menu"], [role="dialog"], input, textarea'))
      ) {
        return;
      }

      // KeyboardEvent has no pointer buttons. Track the real stage gesture,
      // including releases outside this portal, before handling Escape.
      if (pointerActiveRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // Check if an open menu or dialog exists
      if (
        document.querySelector?.(
          '[role="menu"], [role="dialog"], [data-menu-open="true"]',
        )
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onExit?.();
    };
    window.addEventListener("pointerup", finishPointer, true);
    window.addEventListener("pointercancel", finishPointer, true);
    window.addEventListener("blur", finishPointer);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerup", finishPointer, true);
      window.removeEventListener("pointercancel", finishPointer, true);
      window.removeEventListener("blur", finishPointer);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onExit]);

  return (
    <div
      data-testid="editor-3d-focus-stage"
      data-node-id={nodeId}
      onPointerDownCapture={() => {
        pointerActiveRef.current = true;
      }}
      className="absolute inset-0 z-40 flex flex-col bg-neutral-950/80 backdrop-blur-sm"
    >
      {/* Focus Header Bar: frame title and exit button */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 bg-neutral-900/90 px-4 max-md:h-16">
        <div className="flex items-center gap-2 text-[12px] font-medium text-neutral-200">
          <IconBox3
            size={14}
            strokeWidth={ICON_STROKE_WIDTH}
            className="text-[#eed0ff]"
          />
          <span>{title || t("editor.canvasType.threeD")}</span>
          <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-neutral-400">
            {t("editor.three.enterFocus")}
          </span>
        </div>
        <button
          type="button"
          data-testid="editor-exit-3d-focus-btn"
          onClick={onExit}
          title={t("editor.three.exitFocus")}
          aria-label={t("editor.three.exitFocus")}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#E5B2FF] max-md:h-12"
        >
          <IconClose size={14} strokeWidth={ICON_STROKE_WIDTH} />
          <span>{t("editor.three.exitFocus")}</span>
        </button>
      </div>

      {/* Main Viewport Area */}
      <div
        data-testid="editor-3d-focus-available-area"
        className="relative min-h-0 flex-1 w-full overflow-hidden flex items-center justify-center"
        style={{ containerType: "size" }}
      >
        <div
          data-testid="editor-3d-focus-viewport-container"
          className="relative w-full h-full overflow-hidden flex items-center justify-center"
          style={getThreeCameraPreviewStyle(doc)}
        >
          <Suspense fallback={null}>
            <ThreeSceneViewport
              doc={doc}
              getDocument={getDocument}
              selectedId={selectedId}
              selectedIds={selectedIds}
              readOnly={readOnly || false}
              interactive={true}
              toolMode={toolMode}
              onToolMode={onToolMode}
              showToolGroup={true}
              viewControls={true}
              resolveAsset={resolveAsset}
              onSelect={onSelect}
              onPatchNode={onPatchNode}
              onPatchScene={onPatchScene}
              onCommit={onCommit}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

ThreeSceneFocusStage.propTypes = {
  nodeId: PropTypes.string,
  title: PropTypes.string,
  doc: PropTypes.object,
  getDocument: PropTypes.func,
  selectedId: PropTypes.string,
  selectedIds: PropTypes.array,
  readOnly: PropTypes.bool,
  toolMode: PropTypes.string,
  onToolMode: PropTypes.func,
  onPatchNode: PropTypes.func,
  onPatchScene: PropTypes.func,
  onCommit: PropTypes.func,
  onSelect: PropTypes.func,
  resolveAsset: PropTypes.func,
  onExit: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
