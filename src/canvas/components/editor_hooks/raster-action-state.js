/** One reducer owns the related busy/progress/error fields of raster actions. */
export const INITIAL_RASTER_STATE = Object.freeze({
  maskBusy: false, maskError: false, maskProgress: null, mattingDownload: null,
  repaintBusy: false, selectionRepaintBusy: false, lassoBusy: false, repaintStatus: null,
  upscaleBusy: false, upscaleProgress: null, retouchBusy: false, retouchFailure: null,
  performanceTier: null,
});

/** Preserve React setter semantics, including functional updates and no-op identity. */
export function rasterActionReducer(state, { key, value }) {
  if (!Object.hasOwn(INITIAL_RASTER_STATE, key)) throw new Error(`Unknown raster state field: ${key}`);
  const next = typeof value === "function" ? value(state[key]) : value;
  return Object.is(state[key], next) ? state : { ...state, [key]: next };
}

/** Stable adapters let the optional action implementations keep their setter contracts. */
export function rasterStateSetters(dispatch) {
  return Object.fromEntries(Object.keys(INITIAL_RASTER_STATE).map(key => [
    `set${key[0].toUpperCase()}${key.slice(1)}`, value => dispatch({ key, value }),
  ]));
}
