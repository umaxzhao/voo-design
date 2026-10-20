/** One live WebGL viewport, independent from the React editor shell. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { normalizeScene3d } from "./canvas-composition-model.js";
import {
  editorPointToWorld,
  getRenderableSceneNodes,
  worldPointToEditor,
} from "./three-scene-model.js";
import { createSceneObject } from "./three-scene-objects.js";
import {
  createStudioEnvironment,
  getAssignedMaterialAsset,
} from "./three-scene-material-renderer.js";
import {
  applyThreeSceneColorGrading,
  applyThreeSceneVisualSettings,
  createSceneGrid,
  disposeThreeSceneVisualSettings,
  resizeOrthographicCamera,
} from "./three-scene-visual-runtime.js";
import {
  applyTransform,
  captureCameraState,
  captureRendererAtSize,
  hasCameraMoved,
  makeCamera,
  renderKey,
  setCameraPosition,
} from "./three-scene-runtime-helpers.js";
import { createSceneTransformControls } from "./three-scene-transform-controls.js";
import { createSceneEffectsController } from "./three-scene-effects-runtime.js";
import { attachOrbitGesture } from "./three-scene-orbit-gesture.js";
import {
  cameraQuaternion,
  configureViewControls,
  frameBounds,
  orbitStep,
  snapToView,
} from "./three-scene-view-controls.js";
import { attachThreeSceneDiagnostics } from "./three-scene-diagnostics.js";

/** One texel of the shadow map, in the square it is drawn over. */
const SHADOW_MAP_SIZE = 1024;

/**
 * Switch shadow mapping on and arm the key light.
 *
 * This has to happen before any material compiles: flipping
 * `shadowMap.enabled` afterwards leaves every existing program built without
 * it. The shadow camera itself is sized per document by
 * {@link fitShadowCamera} — Three's default ±5 covers nothing in a scene
 * measured in pixels, which is why the primitives' `castShadow` flags never
 * produced a shadow at all.
 *
 * @param {object} renderer the WebGL renderer backing this viewport
 * @param {THREE.DirectionalLight} light the scene's key light
 */
export function enableShadows(renderer, light) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  light.castShadow = true;
  light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
}

/**
 * Fit the key light's shadow frustum around `bounds`.
 *
 * The light aims at the world origin — the scene is built about it and is
 * never retargeted — so the frustum only has to be wide enough for the
 * bounding sphere's silhouette as seen down that axis, and deep enough for
 * both of its ends. The offset is one map texel in world units: enough to
 * stop a flat face flickering against its own shadow without peeling the
 * shadow off the object it belongs to.
 *
 * @param {THREE.DirectionalLight} light
 * @param {THREE.Box3} bounds world bounds of everything that may cast
 */
export function fitShadowCamera(light, bounds) {
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const extent = Math.max(1, sphere.radius + sphere.center.length());
  const distance = light.position.length();
  const camera = light.shadow.camera;
  camera.left = -extent;
  camera.right = extent;
  camera.top = extent;
  camera.bottom = -extent;
  camera.near = Math.max(0.1, distance - extent);
  camera.far = distance + extent;
  camera.updateProjectionMatrix();
  light.shadow.normalBias = (2 * extent) / SHADOW_MAP_SIZE;
  light.shadow.bias = -0.0005;
}

/**
 * Whether this surface may turn the camera at all.
 *
 * Picked, and either editable or read-only-but-drivable: a 3D instance's hit
 * surface is read-only on purpose and still orbits with a pointer, so its
 * view keys have to reach the same answer here that `viewKeyDownAction` in
 * `three-scene-viewport.jsx` reaches before a key is even claimed.
 *
 * @param {{interactive?: boolean, readOnly?: boolean,
 *   allowReadOnlyInteraction?: boolean}} surface
 * @returns {boolean}
 */
export function cameraInputAllowed({
  interactive = true,
  readOnly = false,
  allowReadOnlyInteraction = false,
} = {}) {
  return interactive && (allowReadOnlyInteraction || !readOnly);
}

/** Computes union Box3 encompassing all objects in selectedIds. */
export function computeSelectionBounds(records, selectedIds) {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return null;
  const box = new THREE.Box3();
  let count = 0;
  for (const id of selectedIds) {
    const obj = records.get(id)?.object;
    if (obj) {
      box.expandByObject(obj);
      count++;
    }
  }
  return count > 0 && !box.isEmpty() ? box : null;
}

/** Centroid about which the viewport orbits: selection centroid or world origin. */
export function computeOrbitPivot(
  records,
  selectedIds,
  worldOrigin = new THREE.Vector3(0, 0, 0),
) {
  const box = computeSelectionBounds(records, selectedIds);
  if (!box) return worldOrigin;
  return box.getCenter(new THREE.Vector3());
}

/** The caller owns the canvas element and updates the runtime through setDocument. */
export function createThreeSceneRuntime(canvas, options = {}) {
  // An embedded scene renders in document order, but takes input from the
  // selected instance's hit surface above the editor's 2D pointer canvas.
  const inputElement = options.inputElement ?? canvas;
  let allowReadOnlyInteraction = options.allowReadOnlyInteraction === true;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  let studioEnvironment = null;
  const objects = new THREE.Group();
  scene.add(objects);
  const ambient = new THREE.AmbientLight(0xffffff, 1);
  const directional = new THREE.DirectionalLight(0xffffff, 1.5);
  directional.position.set(400, 600, 800);
  scene.add(ambient, directional);
  // Before any material compiles, so every program is built with shadows in.
  enableShadows(renderer, directional);

  const records = new Map();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const clock = new THREE.Clock();
  let doc = null;
  let camera = null;
  let controls = null;
  let transformControls = null;
  let toolMode = "translate";
  let cameraStart = null;
  let cameraKey = null;
  let grid = null;
  let selectionBoxes = [];
  let selectionBox = null;
  let selectedId = null;
  let selectedIds = [];
  let frameId = null;
  let visible = true;
  let disposed = false;
  let interactive = options.interactive !== false;
  let readOnly = Boolean(options.readOnly);
  let enableTransform = options.enableTransform !== false;
  let pointerStart = null;
  let viewKey = "";
  let width = 1;
  let height = 1;
  const effectsController = createSceneEffectsController({
    renderer,
    scene,
    getCamera: () => camera,
  });

  /** Tell the navigation gizmo when the camera orientation changes. */
  function emitView() {
    if (!camera || !options.onViewChange) return;
    const orientation = cameraQuaternion(camera);
    const key = orientation.join(",");
    if (key === viewKey) return;
    viewKey = key;
    // Live camera for tests and debugging; the document only gets it on release.
    canvas.dataset.threeCamera = camera.position
      .toArray()
      .map((value) => Math.round(value))
      .join(",");
    options.onViewChange(orientation);
  }

  function draw(renderTime = clock.getElapsedTime()) {
    if (disposed || !camera) return;
    for (const box of selectionBoxes) box.update();
    canvas.dataset.threeEffectsReady = String(effectsController.isReady());
    canvas.dataset.threeEffects = effectsController.activeEffects();
    effectsController.render(renderTime);
    emitView();
  }

  // Read immediately after rendering: WebGL may clear its drawing buffer
  // before the next frame when preserveDrawingBuffer is disabled.
  canvas.captureThreeScenePreview = (exportWidth, exportHeight) => {
    if (disposed || !camera) throw new Error("THREE_SCENE_PREVIEW_NOT_READY");
    if (typeof options.getDocument === "function") {
      const latestDoc = options.getDocument();
      if (latestDoc && latestDoc !== doc) {
        setDocument(latestDoc);
      }
    }
    const hasExportSize =
      Number.isFinite(exportWidth) &&
      Number.isFinite(exportHeight) &&
      exportWidth > 0 &&
      exportHeight > 0;
    const helpers = [
      grid,
      ...selectionBoxes,
      ...scene.children.filter((child) => child.isTransformControlsRoot),
    ].filter(Boolean);
    const visibility = helpers.map((helper) => helper.visible);
    try {
      for (const helper of helpers) helper.visible = false;
      if (hasExportSize) {
        return captureRendererAtSize({
          renderer,
          effectsController,
          camera,
          width: exportWidth,
          height: exportHeight,
          updateCamera: updateCameraForSize,
          render: () => draw(0),
          readFrame: () => canvas.toDataURL("image/png"),
        });
      }
      draw(0);
      return canvas.toDataURL("image/png");
    } finally {
      helpers.forEach((helper, index) => {
        helper.visible = visibility[index];
      });
      requestFrame();
    }
  };

  function tick() {
    frameId = null;
    if (disposed || !visible || globalThis.document?.hidden) return;
    const delta = Math.min(clock.getDelta(), 0.1);
    for (const record of records.values()) record.advance?.(delta);
    draw();
    frameId = requestAnimationFrame(tick);
  }

  function requestFrame() {
    if (frameId === null && visible && !globalThis.document?.hidden) {
      clock.getDelta();
      frameId = requestAnimationFrame(tick);
    }
  }

  function updateSelection() {
    for (const box of selectionBoxes) {
      scene.remove(box);
      box.geometry.dispose();
      box.material.dispose();
    }
    selectionBoxes = [];
    selectionBox = null;

    const activeIds =
      selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [];
    for (const id of activeIds) {
      const object = records.get(id)?.object;
      if (object) {
        const box = new THREE.BoxHelper(object, 0xe5b2ff);
        scene.add(box);
        selectionBoxes.push(box);
        if (!selectionBox) selectionBox = box;
      }
    }

    const nodes = doc ? getRenderableSceneNodes(doc) : [];
    const items = [];
    for (const id of activeIds) {
      const index = nodes.findIndex((node) => node.id === id);
      const selectedNode = nodes[index] ?? null;
      const object = records.get(id)?.object ?? null;
      if (selectedNode && object) {
        const layerOffset =
          selectedNode && !["mesh3d", "model3d"].includes(selectedNode.kind)
            ? index * 0.01
            : 0;
        items.push({ node: selectedNode, object, doc, layerOffset });
      }
    }

    if (items.length === 1) {
      transformControls?.setSelection(
        items[0].node,
        items[0].object,
        doc,
        items[0].layerOffset,
      );
    } else if (items.length > 1) {
      transformControls?.setSelection(items);
    } else {
      transformControls?.setSelection(null, null, doc, 0);
    }
    draw();
  }

  function updateCameraForSize(nextWidth, nextHeight) {
    if (camera && doc) {
      if (camera.isPerspectiveCamera) {
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
      } else {
        resizeOrthographicCamera(
          THREE,
          camera,
          doc,
          nextWidth,
          nextHeight,
          normalizeScene3d(doc.scene3d, doc.width, doc.height).frame.autoZoom,
        );
      }
    }
  }

  function resize() {
    const container = canvas.parentElement;
    width = Math.max(1, container?.clientWidth || canvas.clientWidth || 1);
    height = Math.max(1, container?.clientHeight || canvas.clientHeight || 1);
    renderer.setSize(width, height, false);
    effectsController.resize(width, height);
    updateCameraForSize(width, height);
    draw();
  }

  function applyScene(nextDoc) {
    const settings = normalizeScene3d(
      nextDoc.scene3d,
      nextDoc.width,
      nextDoc.height,
    );
    effectsController.configure(settings.effects).then(draw);
    applyThreeSceneVisualSettings({
      THREE,
      scene,
      renderer,
      directional,
      settings,
    });
    if (settings.environment.type === "studio" && !studioEnvironment) {
      // Preview owns one PMREM; slider edits only update environmentIntensity.
      studioEnvironment = createStudioEnvironment(THREE, renderer);
    }
    scene.environment =
      settings.environment.type === "studio" ? studioEnvironment.texture : null;
    scene.environmentIntensity = settings.environment.intensity;
    canvas.dataset.threeEnvironment = settings.environment.type;
    canvas.dataset.threeEnvironmentIntensity = String(
      settings.environment.intensity,
    );
    // An instance can show the object at its own angle; the scene's origin is
    // the frame's centre, so this turns the content about its middle. Editor Y
    // is down, so X and Z reverse (as for node rotations).
    const content = settings.contentRotation ?? {};
    const radians = (value) =>
      THREE.MathUtils.degToRad(Number.isFinite(value) ? value : 0);
    objects.rotation.set(
      -radians(content.rotationX),
      radians(content.rotationY),
      -radians(content.rotationZ),
    );
    ambient.intensity = settings.lighting.ambientIntensity;
    ambient.color.set(settings.lighting.ambientColor);
    directional.intensity = settings.lighting.directionalIntensity;
    directional.color.set(settings.lighting.directionalColor);
    const lightPosition = editorPointToWorld(
      settings.lighting.directionalPosition,
      nextDoc,
    );
    directional.position.set(lightPosition.x, lightPosition.y, lightPosition.z);
    const nextCameraKey = JSON.stringify([
      settings.camera,
      nextDoc.width,
      nextDoc.height,
    ]);
    if (cameraKey !== nextCameraKey) {
      const projectionChanged =
        !camera ||
        Boolean(camera.isPerspectiveCamera) !==
          (settings.camera.projection === "perspective");
      if (projectionChanged) {
        transformControls?.dispose();
        transformControls = null;
        controls?.dispose();
        if (camera) scene.remove(camera);
        camera = makeCamera(settings.camera, nextDoc, width / height);
        scene.add(camera);
        controls = new OrbitControls(camera, inputElement);
        configureViewControls(controls);
        controls.addEventListener("change", draw);
        controls.addEventListener("start", () => {
          cameraStart = captureCameraState(camera, controls);
        });
        controls.addEventListener("end", commitCamera);
        transformControls = createSceneTransformControls({
          scene,
          camera,
          canvas: inputElement,
          onChange: draw,
          onDragChange: (dragging) => {
            controls.enabled =
              interactive &&
              (!readOnly || allowReadOnlyInteraction) &&
              !dragging;
          },
          onCommit: (id, patch) => {
            const patched = options.onPatchNode?.(id, patch);
            if (patched !== false) options.onCommit?.();
          },
          onCommitMany: (patches) => {
            let anyPatched = false;
            for (const { id, patch } of patches) {
              const patched = options.onPatchNode?.(id, patch);
              if (patched !== false) anyPatched = true;
            }
            if (anyPatched) options.onCommit?.();
          },
        });
        transformControls.setMode(toolMode);
      }
      controls.target.copy(setCameraPosition(camera, settings.camera, nextDoc));
      controls.enabled =
        interactive &&
        (!readOnly || allowReadOnlyInteraction) &&
        !transformControls?.isDragging();
      transformControls?.setEnabled(
        interactive && !readOnly && enableTransform,
      );
      controls.update();
      cameraKey = nextCameraKey;
    }
    const gridSettings = settings.grid;
    const gridSize = Math.max(nextDoc.width, nextDoc.height) * 2;
    if (
      grid &&
      (grid.userData.size !== gridSize ||
        grid.userData.plane !== gridSettings.plane ||
        grid.userData.step !== gridSettings.step)
    ) {
      scene.remove(grid);
      grid.geometry.dispose();
      grid.material.dispose();
      grid = null;
    }
    if (!grid && gridSettings.plane !== "off") {
      grid = createSceneGrid(THREE, {
        width: nextDoc.width,
        height: nextDoc.height,
        plane: gridSettings.plane,
        step: gridSettings.step,
      });
      scene.add(grid);
    }
    if (grid) grid.visible = gridSettings.plane !== "off" && !readOnly;
    transformControls?.setSnapping(gridSettings);
    canvas.dataset.threeGridVisible = String(Boolean(grid?.visible));
    canvas.dataset.threeGridPlane = gridSettings.plane;
    canvas.dataset.threeGridSnap =
      gridSettings.snapping === "grid" ? String(gridSettings.step) : "off";
  }

  function commitCamera() {
    const started = cameraStart;
    cameraStart = null;
    if (
      !doc ||
      !camera ||
      !interactive ||
      (readOnly && !allowReadOnlyInteraction)
    )
      return;
    // OrbitControls also reports "end" for buttons it does not handle (the
    // left button drives the transform gizmo); no start means no camera move.
    if (!started || !hasCameraMoved(started, camera, controls)) return;
    publishCamera();
  }

  function publishCamera() {
    const position = worldPointToEditor(camera.position, doc);
    const target = worldPointToEditor(controls.target, doc);
    options.onCameraChange?.({ position, target, zoom: camera.zoom });
  }

  /** Move the camera by a view command, then store it like a mouse orbit. */
  function moveCamera(change) {
    if (
      !doc ||
      !camera ||
      !controls ||
      !cameraInputAllowed({ interactive, readOnly, allowReadOnlyInteraction })
    )
      return false;
    const started = captureCameraState(camera, controls);
    if (change() === false) return false;
    controls.update();
    draw();
    if (hasCameraMoved(started, camera, controls)) publishCamera();
    return true;
  }

  function setDocument(nextDoc) {
    if (disposed || !nextDoc) return;
    doc = nextDoc;
    applyScene(nextDoc);
    const nextNodes = getRenderableSceneNodes(nextDoc);
    const remaining = new Set(nextNodes.map((node) => node.id));
    for (const [id, record] of records) {
      if (remaining.has(id)) continue;
      objects.remove(record.object);
      record.dispose();
      records.delete(id);
    }
    for (const [index, node] of nextNodes.entries()) {
      if (node.id === selectedId && transformControls?.isDragging()) continue;
      const materialAsset = getAssignedMaterialAsset(nextDoc.scene3d, node);
      const source = options.resolveAsset?.(node) ?? node.src;
      const key = renderKey(node, typeof source === "string" ? source : "");
      let record = records.get(node.id);
      if (record?.signature !== key) {
        if (record) {
          objects.remove(record.object);
          record.dispose();
        }
        record = createSceneObject(node, {
          resolveAsset: () => source,
          onReady: draw,
          onError: options.onError,
          materialAsset,
        });
        record.signature = key;
        records.set(node.id, record);
        objects.add(record.object);
      }
      record.update?.(node, materialAsset);
      applyTransform(record.object, node, nextDoc, index);
    }
    applyThreeSceneColorGrading(
      objects,
      normalizeScene3d(nextDoc.scene3d, nextDoc.width, nextDoc.height)
        .colorGrading,
    );
    // Aim the shadow at what the document actually contains; the light itself
    // is repositioned by applyScene above, so this runs after both.
    scene.updateMatrixWorld(true);
    fitShadowCamera(directional, new THREE.Box3().setFromObject(objects));
    // Force custom uniform uploads even when one mesh retains its program.
    renderer.resetState();
    canvas.dataset.threeObjectCount = String(records.size);
    resize();
    updateSelection();
    requestFrame();
  }

  function setSelectedId(id) {
    selectedId = id;
    selectedIds = id ? [id] : [];
    // What the viewport currently treats as selected (its orbit pivot).
    canvas.dataset.threeSelected = id ?? "";
    updateSelection();
  }

  function setSelectedIds(ids) {
    selectedIds = Array.isArray(ids) ? [...ids] : [];
    selectedId = selectedIds[0] ?? null;
    canvas.dataset.threeSelected = selectedIds.join(",");
    updateSelection();
  }

  function setInputMode(mode) {
    interactive = mode.interactive !== false;
    readOnly = Boolean(mode.readOnly);
    allowReadOnlyInteraction = Boolean(mode.allowReadOnlyInteraction);
    enableTransform = mode.enableTransform !== false;
    if (controls)
      controls.enabled =
        interactive &&
        (!readOnly || allowReadOnlyInteraction) &&
        !transformControls?.isDragging();
    transformControls?.setEnabled(interactive && !readOnly && enableTransform);
    if (doc) {
      const settings = normalizeScene3d(doc.scene3d, doc.width, doc.height);
      if (grid) grid.visible = !readOnly && settings.grid.plane !== "off";
      canvas.dataset.threeGridVisible = String(Boolean(grid?.visible));
    }
    draw();
  }

  function setToolMode(mode) {
    toolMode = mode;
    transformControls?.setMode(mode);
    draw();
  }

  function onPointerDown(event) {
    if (interactive) event.stopPropagation();
    pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
  }

  // The right button orbits the view; it must not open the editor's menu.
  function onContextMenu(event) {
    if (!interactive) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // Move and up must reach the document: OrbitControls listens for them there
  // once a drag starts. Stage gestures only ever begin on pointerdown, which
  // is still stopped, so letting these through cannot start one.
  function onPointerUp(event) {
    // Only a left click selects; middle and right presses navigate.
    if (event.button !== 0) return;
    if (transformControls?.isDragging()) {
      pointerStart = null;
      return;
    }
    if (!doc || !camera || !pointerStart || !interactive) return;
    // Only a plain left click selects; other buttons navigate.
    if (pointerStart.button !== 0) {
      pointerStart = null;
      return;
    }
    const distance = Math.hypot(
      event.clientX - pointerStart.x,
      event.clientY - pointerStart.y,
    );
    pointerStart = null;
    if (distance > 4) return;
    const bounds = inputElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      [...records.values()].map((record) => record.object),
      true,
    );
    const hit = hits.find((entry) => {
      let target = entry.object;
      while (target && !target.userData.nodeId) target = target.parent;
      return target?.userData.nodeId;
    });
    const meta = {
      shiftKey: Boolean(event.shiftKey),
      metaKey: Boolean(event.metaKey),
      ctrlKey: Boolean(event.ctrlKey),
    };
    if (!hit) {
      options.onSelect?.(null, meta);
      return;
    }
    let target = hit.object;
    while (target && !target.userData.nodeId) target = target.parent;
    options.onSelect?.(target?.userData.nodeId ?? null, meta);
  }

  function onVisibilityChange() {
    if (globalThis.document?.hidden && frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
      return;
    }
    requestFrame();
  }

  function stopStageGesture(event) {
    if (interactive) event.stopPropagation();
  }

  // Where the view turns about: the selected object's centre, else the world's.
  const worldOrigin = new THREE.Vector3(0, 0, 0);
  function orbitPivot() {
    const activeIds =
      selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [];
    return computeOrbitPivot(records, activeIds, worldOrigin);
  }
  const orbitGesture = attachOrbitGesture({
    canvas: inputElement,
    getRig: () => (camera && controls ? { camera, controls } : null),
    getPivot: orbitPivot,
    isEnabled: () =>
      interactive &&
      (!readOnly || allowReadOnlyInteraction) &&
      !transformControls?.isDragging(),
    onStart: () => {
      cameraStart = captureCameraState(camera, controls);
    },
    onChange: draw,
    onEnd: commitCamera,
  });
  inputElement.addEventListener("pointerdown", onPointerDown);
  inputElement.addEventListener("pointerup", onPointerUp);
  inputElement.addEventListener("contextmenu", onContextMenu);
  inputElement.addEventListener("wheel", stopStageGesture);
  inputElement.addEventListener("dblclick", stopStageGesture);
  globalThis.document?.addEventListener("visibilitychange", onVisibilityChange);
  const resizeObserver = globalThis.ResizeObserver
    ? new ResizeObserver(resize)
    : null;
  if (canvas.parentElement) resizeObserver?.observe(canvas.parentElement);
  const intersectionObserver = globalThis.IntersectionObserver
    ? new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (!visible && frameId !== null) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
        if (visible) requestFrame();
      })
    : null;
  intersectionObserver?.observe(canvas);
  const detachDiagnostics = attachThreeSceneDiagnostics({
    canvas,
    THREE,
    getRig: () => ({ camera, controls }),
    records,
    objects,
  });
  resize();

  return {
    setDocument,
    setSelectedId,
    setSelectedIds,
    setInputMode,
    setToolMode,
    setView: (view) => moveCamera(() => snapToView(camera, controls, view)),
    orbitBy: (yawSteps, pitchSteps) =>
      moveCamera(() => orbitStep(camera, controls, yawSteps, pitchSteps)),
    /** Frame the selected object(s), or the whole scene when nothing is picked. */
    frame: (selectedOnly = false) =>
      moveCamera(() => {
        if (!selectedOnly) {
          if (!objects) return false;
          return frameBounds(
            camera,
            controls,
            new THREE.Box3().setFromObject(objects),
          );
        }
        const activeIds =
          selectedIds.length > 0 ? selectedIds : selectedId ? [selectedId] : [];
        const box = computeSelectionBounds(records, activeIds);
        if (!box) return false;
        return frameBounds(camera, controls, box);
      }),
    resize,
    dispose() {
      disposed = true;
      detachDiagnostics();
      delete canvas.captureThreeScenePreview;
      if (frameId !== null) cancelAnimationFrame(frameId);
      inputElement.removeEventListener("pointerdown", onPointerDown);
      inputElement.removeEventListener("pointerup", onPointerUp);
      inputElement.removeEventListener("contextmenu", onContextMenu);
      orbitGesture.dispose();
      inputElement.removeEventListener("wheel", stopStageGesture);
      inputElement.removeEventListener("dblclick", stopStageGesture);
      globalThis.document?.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      transformControls?.dispose();
      controls?.dispose();
      for (const record of records.values()) record.dispose();
      records.clear();
      for (const box of selectionBoxes) {
        box.geometry.dispose();
        box.material.dispose();
      }
      selectionBoxes = [];
      selectionBox = null;
      grid?.geometry.dispose();
      grid?.material.dispose();
      studioEnvironment?.dispose();
      disposeThreeSceneVisualSettings(scene);
      effectsController.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
