import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { styleTransformGizmo } from "./three-scene-gizmo-style.js";
import { gridTranslationSnap } from "./three-scene-settings.js";
import {
  computeSelectionMedianPoint,
  computeMultiTransformLiveState,
  getMultiNodeTransformPatches,
  getNodeTransformPatch,
  hasNodeTransformChange,
  TRANSLATION_SNAP_STEP,
  SCALE_SNAP_STEP,
} from "./three-scene-transform.js";

const MODES = new Set(["translate", "rotate", "scale"]);

export function createSceneTransformControls({
  scene,
  camera,
  canvas,
  onChange,
  onDragChange,
  onCommit,
  onCommitMany,
}) {
  let selection = null;
  let multiSelection = null;
  let dragStart = null;
  let enabled = false;
  let disposed = false;
  let mode = "translate";
  let activeGrid = null;
  let shiftPressed = false;

  const pivotObject = new THREE.Group();
  const main = new TransformControls(camera, canvas);
  styleTransformGizmo(main);
  const all = [main];
  const helpers = all.map((controls) => controls.getHelper());
  for (const helper of helpers) scene.add(helper);
  canvas.dataset.threeGizmoMode = mode;
  canvas.dataset.threeGizmoAxis = "";

  const activeAxis = () => main.axis ?? "";

  function updateAttachment() {
    if (!enabled) {
      main.detach();
      if (pivotObject.parent) scene.remove(pivotObject);
      canvas.dataset.threeGizmoAxis = "";
      onChange();
      return;
    }
    if (selection?.object) {
      if (pivotObject.parent) scene.remove(pivotObject);
      main.attach(selection.object);
    } else if (multiSelection && multiSelection.length > 1) {
      const median = computeSelectionMedianPoint(
        multiSelection.map((s) => s.object),
      );
      pivotObject.position.copy(median);
      pivotObject.rotation.set(0, 0, 0);
      pivotObject.scale.set(1, 1, 1);
      if (!pivotObject.parent) scene.add(pivotObject);
      main.attach(pivotObject);
    } else {
      main.detach();
      if (pivotObject.parent) scene.remove(pivotObject);
    }
    canvas.dataset.threeGizmoAxis = "";
    onChange();
  }

  function handleChange() {
    if (dragStart?.multi) {
      computeMultiTransformLiveState({
        mode: dragStart.mode,
        pivot: pivotObject,
        initialPivot: dragStart.initialPivot,
        items: dragStart.items,
      });
    }
    canvas.dataset.threeGizmoAxis = activeAxis();
    onChange();
  }

  const handleMouseDown = (controls) => () => {
    if (!enabled) return;
    if (multiSelection && multiSelection.length > 1) {
      dragStart = {
        multi: true,
        controls,
        mode: controls.mode,
        doc: multiSelection[0].doc,
        initialPivot: {
          position: pivotObject.position.clone(),
          quaternion: pivotObject.quaternion.clone(),
          scale: pivotObject.scale.clone(),
        },
        items: multiSelection.map((item) => ({
          node: item.node,
          object: item.object,
          initialPosition: item.object.position.clone(),
          initialRotation: item.object.rotation.clone(),
          initialQuaternion: item.object.quaternion.clone(),
          initialScale: item.object.scale.clone(),
          offsetFromPivot: item.object.position
            .clone()
            .sub(pivotObject.position),
          layerOffset: item.layerOffset,
        })),
      };
      onDragChange(true);
      return;
    }
    if (!selection?.object) return;
    dragStart = {
      ...selection,
      controls,
      mode: controls.mode,
      initialScale: selection.object.scale.clone(),
      // Euler decomposition is not unique; the commit uses this to keep a
      // single-axis drag writing a single-axis delta.
      initialRotation: selection.object.rotation.clone(),
    };
    onDragChange(true);
  };

  const ROTATION_SNAP_INCREMENT_RAD = (15 * Math.PI) / 180;

  const onKeyDown = (event) => {
    if (event.key === "Shift") {
      shiftPressed = true;
      main.rotationSnap = ROTATION_SNAP_INCREMENT_RAD;
      main.translationSnap = activeGrid?.step ?? TRANSLATION_SNAP_STEP;
      main.scaleSnap = SCALE_SNAP_STEP;
    }
  };
  const onKeyUp = (event) => {
    if (event.key === "Shift") {
      shiftPressed = false;
      main.rotationSnap = null;
      main.translationSnap = activeGrid ? gridTranslationSnap(activeGrid) : null;
      main.scaleSnap = null;
    }
  };
  const onPointerDown = (event) => {
    shiftPressed = Boolean(event.shiftKey);
    if (event.shiftKey) {
      main.rotationSnap = ROTATION_SNAP_INCREMENT_RAD;
      main.translationSnap = activeGrid?.step ?? TRANSLATION_SNAP_STEP;
      main.scaleSnap = SCALE_SNAP_STEP;
    } else {
      main.rotationSnap = null;
      main.translationSnap = activeGrid ? gridTranslationSnap(activeGrid) : null;
      main.scaleSnap = null;
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }
  canvas?.addEventListener?.("pointerdown", onPointerDown);

  const handleMouseUp = (controls) => () => {
    const started = dragStart;
    if (started && started.controls !== controls) return;
    dragStart = null;
    onDragChange(false);
    if (!started || !enabled) return;

    if (started.multi) {
      const patches = getMultiNodeTransformPatches({
        mode: started.mode,
        doc: started.doc,
        items: started.items,
        snapRotation: Boolean(main.rotationSnap),
      });
      if (patches.length > 0) {
        queueMicrotask(() => {
          if (!disposed) {
            if (onCommitMany) onCommitMany(patches);
            else {
              for (const { id, patch } of patches) onCommit(id, patch);
            }
          }
        });
      }
      return;
    }

    if (controls.object !== started.object) return;
    const patch = getNodeTransformPatch({
      node: started.node,
      doc: started.doc,
      mode: started.mode,
      position: started.object.position,
      rotation: started.object.rotation,
      scale: started.object.scale,
      initialScale: started.initialScale,
      initialRotation: started.initialRotation,
      layerOffset: started.layerOffset,
      snapRotation: Boolean(main.rotationSnap),
    });
    if (hasNodeTransformChange(started.node, patch)) {
      // Three clears dragging after mouseUp listeners return. Apply the document
      // update afterward so the next render uses the persisted dimensions once.
      queueMicrotask(() => {
        if (!disposed) onCommit(started.node.id, patch);
      });
    }
  };

  const listeners = all.map((controls) => ({
    controls,
    down: handleMouseDown(controls),
    up: handleMouseUp(controls),
  }));
  for (const { controls, down, up } of listeners) {
    controls.addEventListener("change", handleChange);
    controls.addEventListener("mouseDown", down);
    controls.addEventListener("mouseUp", up);
  }

  return {
    isDragging: () => main.dragging,
    setSnapping(grid) {
      activeGrid = grid;
      // Document refreshes during a drag must preserve temporary Shift snapping.
      main.translationSnap = shiftPressed
        ? (activeGrid?.step ?? TRANSLATION_SNAP_STEP)
        : gridTranslationSnap(grid);
    },
    setRotationSnap(radians) {
      main.rotationSnap = radians;
    },
    getTranslationSnap: () => main.translationSnap,
    getScaleSnap: () => main.scaleSnap,
    getRotationSnap: () => main.rotationSnap,
    getMainControls: () => main,
    setMode(nextMode) {
      if (!MODES.has(nextMode)) {
        throw new RangeError(`Invalid 3D tool: ${nextMode}`);
      }
      mode = nextMode;
      main.setMode(nextMode);
      canvas.dataset.threeGizmoMode = nextMode;
      updateAttachment();
      canvas.dataset.threeGizmoAxis = activeAxis();
    },
    setEnabled(nextEnabled) {
      enabled = Boolean(nextEnabled);
      for (const controls of all) controls.enabled = enabled;
      if (!enabled) {
        dragStart = null;
        onDragChange(false);
      }
      updateAttachment();
    },
    setSelection(nodeOrItems, object, doc, layerOffset = 0) {
      if (Array.isArray(nodeOrItems)) {
        if (dragStart?.multi) return;
        if (nodeOrItems.length === 1) {
          selection = nodeOrItems[0];
          multiSelection = null;
        } else if (nodeOrItems.length > 1) {
          selection = null;
          multiSelection = nodeOrItems;
        } else {
          selection = null;
          multiSelection = null;
        }
      } else {
        if (dragStart && !dragStart.multi && dragStart.node.id === nodeOrItems?.id)
          return;
        selection =
          nodeOrItems && object
            ? { node: nodeOrItems, object, doc, layerOffset }
            : null;
        multiSelection = null;
      }
      updateAttachment();
    },
    dispose() {
      disposed = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      }
      canvas?.removeEventListener?.("pointerdown", onPointerDown);
      if (pivotObject.parent) scene.remove(pivotObject);
      for (const { controls, down, up } of listeners) {
        controls.removeEventListener("change", handleChange);
        controls.removeEventListener("mouseDown", down);
        controls.removeEventListener("mouseUp", up);
        scene.remove(controls.getHelper());
        controls.detach();
        controls.dispose();
      }
      delete canvas.dataset.threeGizmoAxis;
    },
  };
}
