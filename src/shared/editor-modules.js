/**
 * Editor modular distribution manifest and module registry (L1 on-demand modules).
 *
 * Provides pure data contracts and lookup functions for modular editor packaging:
 * - voo-matting (ONNX runtime WASM binaries for local matting / selection refine)
 *
 * Versioning Semantics (Plan §5.3 Decision):
 * - `version` represents the module's own asset/content version and is completely
 *   decoupled from `package.json`'s app version.
 * - App upgrades do not force module upgrades, and module upgrades do not require app upgrades.
 * - Whether an installed module requires update is determined by comparing the manifest
 *   `version` against the on-disk storage directory `userData/modules/<id>@<version>/`,
 *   not by the host application version.
 * - Rationale:
 *   1. M-1.3 installs to `userData/modules/<id>@<version>/`, natively enabling multi-version
 *      coexistence, atomic activation, and independent cache retention.
 *
 * Pure data + pure functions: no DOM, no electron dependencies, node:test friendly.
 */

export const EDITOR_MODULE = Object.freeze({
  MATTING: "voo-matting",
});

/**
 * Manifest definitions for each downloadable L1 editor module.
 * File entry schema ({ fileName, sizeBytes, sha256 }) is what electron/module_installer.js
 * verifies.
 */
export const MODULE_MANIFEST = Object.freeze({
  [EDITOR_MODULE.MATTING]: Object.freeze({
    id: EDITOR_MODULE.MATTING,
    version: "1.27.0",
    status: "ready",
    sizeBytes: 40378315,
    files: Object.freeze([
      Object.freeze({
        fileName: "ort-wasm-simd-threaded.wasm",
        sizeBytes: 13479978,
        sha256:
          "d1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6",
      }),
      Object.freeze({
        fileName: "ort-wasm-simd-threaded.mjs",
        sizeBytes: 24180,
        sha256:
          "0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3",
      }),
      Object.freeze({
        fileName: "ort-wasm-simd-threaded.jsep.wasm",
        sizeBytes: 26827543,
        sha256:
          "78feeeb3d08f6bcee94d938ed322f69073bb8076b5f9d34697a574ffba8deb48",
      }),
      Object.freeze({
        fileName: "ort-wasm-simd-threaded.jsep.mjs",
        sizeBytes: 46614,
        sha256:
          "3ee381d20a80f51a788a1c4a5872f6f1d047538dd4342f4af00062de5f9ea4c6",
      }),
    ]),
    requiredBy: Object.freeze([
      "matting",
      "local_matting",
      "selection_refine",
      "ai_matting",
      "background_removal",
    ]),
  }),

});

/**
 * Returns the module required to edit a specific node type in the editor router.
 * Used by lazy_image_editor.jsx to determine if an L1 module is required.
 *
 * @param {string|null|undefined} nodeType
 * @returns {string|null} The EDITOR_MODULE value, or null if built-in L0 (e.g. Design Editor)
 */
export function moduleForNodeType(nodeType) {
  if (typeof nodeType !== "string" || !nodeType) return null;
  // The Design editor is built in (L0); no node type needs an L1 module now.
  return null;
}

/**
 * Resolves the module required for a given capability name.
 *
 * @param {string|null|undefined} capability
 * @returns {string|null}
 */
export function moduleForCapability(capability) {
  if (typeof capability !== "string" || !capability) return null;
  for (const [moduleId, manifest] of Object.entries(MODULE_MANIFEST)) {
    if (moduleId === capability || manifest.requiredBy.includes(capability)) {
      return moduleId;
    }
  }
  return null;
}

/**
 * Checks whether an operational capability requires an on-demand L1 editor module.
 *
 * @param {string|null|undefined} capability - Capability or module name
 * @param {string} [targetModule] - Optional specific module to check against
 * @returns {boolean}
 */
export function isModuleRequired(capability, targetModule) {
  if (typeof capability !== "string" || !capability) return false;
  if (targetModule !== undefined) {
    if (typeof targetModule !== "string" || !targetModule) return false;
    const manifest = MODULE_MANIFEST[targetModule];
    if (!manifest) return false;
    return (
      targetModule === capability || manifest.requiredBy.includes(capability)
    );
  }
  return moduleForCapability(capability) !== null;
}

/**
 * Checks whether a module has release assets available to install.
 * A bundled module, or one with no files, returns false.
 *
 * @param {string|null|undefined} moduleId
 * @returns {boolean}
 */
export function isModuleInstallable(moduleId) {
  const manifest = getModuleManifest(moduleId);
  if (!manifest) return false;
  // A bundled module needs no install: it is already in the main bundle.
  return manifest.files.length > 0 && manifest.status !== "bundled";
}

/**
 * Returns the frozen manifest entry for a module, or null if unknown.
 *
 * @param {string|null|undefined} moduleId
 * @returns {object|null}
 */
export function getModuleManifest(moduleId) {
  if (typeof moduleId !== "string" || !moduleId) return null;
  return MODULE_MANIFEST[moduleId] ?? null;
}
