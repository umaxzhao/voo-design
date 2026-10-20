const GRID_PLANES = Object.freeze(["xy", "xz", "yz", "off"]);
const SNAP_MODES = Object.freeze(["off", "grid"]);
const FOG_MODES = Object.freeze(["linear"]);
const SKY_MODES = Object.freeze(["solid", "gradient"]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback, minimum, maximum) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function color(value, fallback) {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
    ? value
    : fallback;
}

export function normalizeSceneEffects(value, defaults) {
  const source = record(value);
  const base = defaults ?? {
    enabled: false,
    bloom: { enabled: false, strength: 0.8, radius: 0.4, threshold: 0.8 },
    vignette: { enabled: false, offset: 0.5, darkness: 0.35 },
    grain: { enabled: false, amount: 0.15 },
    chromaticAberration: { enabled: false, offset: 0.002 },
  };
  const bloom = record(source.bloom);
  const vignette = record(source.vignette);
  const grain = record(source.grain);
  const chromatic = record(source.chromaticAberration);
  return {
    enabled: source.enabled === true,
    bloom: {
      enabled: bloom.enabled === true,
      strength: finite(bloom.strength, base.bloom.strength, 0, 3),
      radius: finite(bloom.radius, base.bloom.radius, 0, 1),
      threshold: finite(bloom.threshold, base.bloom.threshold, 0, 1),
    },
    vignette: {
      enabled: vignette.enabled === true,
      offset: finite(vignette.offset, base.vignette.offset, 0, 1),
      darkness: finite(vignette.darkness, base.vignette.darkness, 0, 1),
    },
    grain: {
      enabled: grain.enabled === true,
      amount: finite(grain.amount, base.grain.amount, 0, 1),
    },
    chromaticAberration: {
      enabled: chromatic.enabled === true,
      offset: finite(
        chromatic.offset,
        base.chromaticAberration.offset,
        0,
        0.02,
      ),
    },
  };
}

export function createDefaultScene3dSettings(width = 100, height = 100) {
  const sceneScale = Math.max(width, height);
  return {
    frame: { autoZoom: true, cameraPreview: false },
    backgroundOpacity: 1,
    fog: {
      enabled: false,
      mode: "linear",
      color: "#000000",
      near: sceneScale * 0.75,
      far: sceneScale * 3,
    },
    sky: {
      enabled: false,
      mode: "solid",
      color: "#252525",
      horizonColor: "#111111",
    },
    // The editor already renders shadows for legacy scenes.
    shadows: { enabled: true, intensity: 0.5, softness: 0.5 },
    colorGrading: { exposure: 0, saturation: 1 },
    effects: normalizeSceneEffects(),
    // Default 3D scenes show a horizontal ground grid in the XZ plane.
    grid: { plane: "xz", snapping: "off", step: Math.max(width, height) / 10 },
  };
}

export function normalizeScene3dSettings(value, defaults, legacyShowGrid) {
  const scene = record(value);
  const base = defaults ?? createDefaultScene3dSettings();
  const frame = record(scene.frame);
  const fog = record(scene.fog);
  const sky = record(scene.sky);
  const shadows = record(scene.shadows);
  const grading = record(scene.colorGrading);
  const grid = record(scene.grid);
  const effects = normalizeSceneEffects(scene.effects, base.effects);
  const legacyGridPlane = legacyShowGrid === false ? "off" : "xy";
  // Legacy callers can still toggle showGrid on a default scene. Preserve that
  // intent for both the old XY default and the current XZ ground plane.
  const legacyGridIsDisabled =
    legacyShowGrid === false &&
    (grid.plane === undefined ||
      grid.plane === "xy" ||
      grid.plane === base.grid.plane);
  const plane = legacyGridIsDisabled
    ? "off"
    : enumValue(
        grid.plane,
        GRID_PLANES,
        scene.grid === undefined ? legacyGridPlane : base.grid.plane,
      );
  const near = finite(fog.near, base.fog.near, 0, 100000);
  const far = finite(fog.far, base.fog.far, 0, 100000);
  const fogValid = far > near && FOG_MODES.includes(fog.mode ?? base.fog.mode);

  return {
    frame: {
      autoZoom: frame.autoZoom !== false,
      cameraPreview: frame.cameraPreview === true,
    },
    backgroundOpacity: finite(scene.backgroundOpacity, 1, 0, 1),
    fog: {
      enabled: fog.enabled === true && fogValid,
      mode: enumValue(fog.mode, FOG_MODES, base.fog.mode),
      color: color(fog.color, base.fog.color),
      near: fogValid ? near : base.fog.near,
      far: fogValid ? far : base.fog.far,
    },
    sky: {
      enabled: sky.enabled === true,
      mode: enumValue(sky.mode, SKY_MODES, base.sky.mode),
      color: color(sky.color, base.sky.color),
      horizonColor: color(sky.horizonColor, base.sky.horizonColor),
    },
    shadows: {
      enabled: shadows.enabled !== false,
      intensity: finite(shadows.intensity, base.shadows.intensity, 0, 1),
      softness: finite(shadows.softness, base.shadows.softness, 0, 1),
    },
    colorGrading: {
      exposure: finite(grading.exposure, base.colorGrading.exposure, -2, 2),
      saturation: finite(
        grading.saturation,
        base.colorGrading.saturation,
        0,
        2,
      ),
    },
    effects,
    grid: {
      plane,
      ...(["xy", "xz", "yz"].includes(grid.lastVisiblePlane)
        ? { lastVisiblePlane: grid.lastVisiblePlane }
        : {}),
      snapping: enumValue(grid.snapping, SNAP_MODES, base.grid.snapping),
      step: finite(grid.step, base.grid.step, 1, 1000),
    },
    showGrid: plane !== "off",
  };
}

export function gridTranslationSnap(grid) {
  return grid?.snapping === "grid" ? grid.step : null;
}
