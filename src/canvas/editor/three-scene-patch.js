/** Merge 3D scene controls against live engine state, including vector axes. */
function mergeVector(current, patch) {
  return patch ? { ...current, ...patch } : current;
}

/** Visibility must not turn a user's XZ/YZ working plane back into XY. */
export function gridTogglePatch(scene3d) {
  const grid = scene3d?.grid;
  const plane = grid?.plane ?? (scene3d?.showGrid === false ? "off" : "xy");
  const remembered = ["xy", "xz", "yz"].includes(grid?.lastVisiblePlane)
    ? grid.lastVisiblePlane
    : "xy";
  return { grid: { plane: plane === "off" ? remembered : "off" } };
}

export function mergeThreeScenePatch(scene3d, patch) {
  const current = scene3d ?? {};
  const next = { ...current, ...patch };
  if (patch.camera) {
    next.camera = {
      ...current.camera,
      ...patch.camera,
      position: mergeVector(current.camera?.position, patch.camera.position),
      target: mergeVector(current.camera?.target, patch.camera.target),
    };
  }
  if (patch.lighting) {
    next.lighting = {
      ...current.lighting,
      ...patch.lighting,
      directionalPosition: mergeVector(
        current.lighting?.directionalPosition,
        patch.lighting.directionalPosition,
      ),
    };
  }
  for (const field of [
    "frame",
    "fog",
    "sky",
    "shadows",
    "colorGrading",
    "grid",
  ]) {
    if (!patch[field]) continue;
    next[field] = { ...current[field], ...patch[field] };
  }
  if (patch.effects) {
    next.effects = { ...current.effects, ...patch.effects };
    for (const effect of [
      "bloom",
      "vignette",
      "grain",
      "chromaticAberration",
    ]) {
      if (patch.effects[effect]) {
        next.effects[effect] = {
          ...current.effects?.[effect],
          ...patch.effects[effect],
        };
      }
    }
  }
  if (patch.grid) {
    const legacyPlane = current.showGrid === false ? "off" : "xy";
    next.grid = {
      plane: current.grid?.plane ?? legacyPlane,
      ...current.grid,
      ...patch.grid,
    };
    // Store only an optional non-default plane, preserving legacy documents.
    // Normalization retains this while hidden so save/reopen can restore it.
    const previousPlane = current.grid?.plane ?? legacyPlane;
    if (
      next.grid.plane === "off" &&
      ["xy", "xz", "yz"].includes(previousPlane)
    ) {
      if (previousPlane !== "xy" || next.grid.lastVisiblePlane) {
        next.grid.lastVisiblePlane = previousPlane;
      }
    } else if (next.grid.lastVisiblePlane && next.grid.plane !== "off") {
      next.grid.lastVisiblePlane = next.grid.plane;
    }
    next.showGrid = next.grid.plane !== "off";
  } else if (typeof patch.showGrid === "boolean") {
    next.grid = {
      ...current.grid,
      plane: patch.showGrid ? "xy" : "off",
    };
    next.showGrid = patch.showGrid;
  }
  return next;
}

export function patchThreeScene(engine, patch) {
  if (!engine) return false;
  const doc = engine.getDocument();
  engine.setDoc(
    { ...doc, scene3d: mergeThreeScenePatch(doc.scene3d, patch) },
    { commit: false },
  );
  return true;
}
