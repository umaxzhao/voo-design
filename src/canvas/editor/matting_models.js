import { MODEL_BASE_URL } from "../../shared/app_endpoints.js";

/**
 * The cutout models the editor can run, as data.
 *
 * Everything that differs between exports lives here — input size,
 * normalisation, download size, licence — because that is what makes swapping
 * one for another a configuration change rather than a code change. The
 * pipeline reads these fields; it knows nothing about any particular model.
 *
 * Two are offered rather than one because the choice is a real trade: a 4MB
 * download that is ready almost immediately, against a 20x larger one that
 * holds fine edges — hair, fur, foliage — far better. Neither answer is right
 * for everyone, so the setting exists.
 */

/** Storage key for the chosen model; a plain string id. */
export const MATTING_MODEL_KEY = "ciw.mattingModel";

const RMBG_NORM = {
  mean: [0.5, 0.5, 0.5],
  std: [1.0, 1.0, 1.0],
};

export const MATTING_MODELS = [
  {
    id: "rmbg-1.4",
    url: `${MODEL_BASE_URL}/rmbg-1.4-fp16.onnx`,
    bytes: 88_217_533,
    inputSize: 1024,
    licence: "bria-rmbg-1.4",
    labelKey: "settings.matting.rmbg",
    hintKey: "settings.matting.rmbgHint",
    ...RMBG_NORM,
  },
];

/** The model to use by default: state of the art RMBG-1.4. */
export const DEFAULT_MATTING_MODEL_ID = "rmbg-1.4";

/**
 * Resolves a stored id to a model.
 *
 * Falls back rather than throwing: a setting can outlive the model it names —
 * an id retired between releases, or a profile synced from a newer build —
 * and a cutout that quietly uses the default beats one that cannot run.
 */
export function resolveMattingModel(id) {
  return (
    MATTING_MODELS.find((model) => model.id === id) ??
    MATTING_MODELS.find((model) => model.id === DEFAULT_MATTING_MODEL_ID) ??
    MATTING_MODELS[0]
  );
}

/** A size a person can read, for the settings row. */
export function formatModelSize(bytes) {
  if (!(bytes > 0)) return "";
  const mb = bytes / 1_048_576;
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}
