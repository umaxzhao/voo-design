/**
 * Editor Host Boundary & Store Bridge Contract (Shared).
 *
 * Defines the explicit decoupled boundary between the image editor engine
 * (src/canvas/editor/) and outer application host environments (such as the
 * canvas workflow store, standalone test runners, or headless workers).
 *
 * Architecture Invariant:
 * The editor engine must NEVER directly import or access useWorkflowStore.
 * All external asset resolution and host callbacks are mediated by this contract.
 */

/**
 * Creates a normalized EditorHost boundary object.
 *
 * @param {Object} [options]
 * @param {(imageId: string) => string | null} [options.resolveImage] - Resolves an imageId to a data/blob URL.
 * @param {(imageIds: string[]) => Promise<Map<string, Blob>>} [options.getImageBlobMap] - Optional blob fetcher.
 * @param {(result: any) => any} [options.onGeneratedOutput] - Sink for generated outputs.
 * @param {string | null} [options.sourceWorkflowNodeId] - Contextual node identifier in host graph.
 * @returns {Readonly<Object>}
 */
export function createEditorHost(options = {}) {
  const customResolveImage =
    typeof options.resolveImage === "function" ? options.resolveImage : null;
  const customBlobMap =
    typeof options.getImageBlobMap === "function"
      ? options.getImageBlobMap
      : null;
  const onGeneratedOutput =
    typeof options.onGeneratedOutput === "function"
      ? options.onGeneratedOutput
      : null;
  const customEnsureModule =
    typeof options.ensureModule === "function" ? options.ensureModule : null;
  const customModuleState =
    typeof options.moduleState === "function" ? options.moduleState : null;
  const customIsModuleInstalled =
    typeof options.isModuleInstalled === "function"
      ? options.isModuleInstalled
      : null;
  const sourceWorkflowNodeId = options.sourceWorkflowNodeId ?? null;

  return Object.freeze({
    /**
     * Resolves an imageId into a data URL or blob URL.
     * Returns null if unresolvable.
     *
     * @param {string} imageId
     * @returns {string | null}
     */
    resolveImage(imageId) {
      if (!imageId || typeof imageId !== "string") return null;
      if (customResolveImage) {
        try {
          return customResolveImage(imageId) ?? null;
        } catch {
          return null;
        }
      }
      return null;
    },

    /**
     * Optional async blob retriever for imageId batch fetches.
     *
     * @param {string} imageId
     * @returns {Promise<Blob | null>}
     */
    async getImageBlob(imageId) {
      if (!imageId || !customBlobMap) return null;
      try {
        const map = await customBlobMap([imageId]);
        return map?.get?.(imageId) ?? null;
      } catch {
        return null;
      }
    },

    /**
     * Ensures that an on-demand editor module is downloaded and ready.
     * Mediates between the editor engine and outer host module loader.
     *
     * @param {string} moduleId - One of EDITOR_MODULE.*
     * @param {object} [opts]
     * @returns {Promise<{ ok: boolean, reason?: string, data?: any }>}
     */
    async ensureModule(moduleId, opts = {}) {
      if (customEnsureModule) {
        try {
          return await customEnsureModule(moduleId, opts);
        } catch (err) {
          return { ok: false, reason: err?.message || String(err) };
        }
      }
      return { ok: true };
    },

    /**
     * Queries the lifecycle state of a module synchronously ("installed" | "available" | "downloading" | "unsupported").
     *
     * @param {string} moduleId
     * @returns {"installed" | "available" | "downloading" | "unsupported"}
     */
    moduleState(moduleId) {
      if (customModuleState) {
        try {
          return customModuleState(moduleId);
        } catch {
          return "available";
        }
      }
      return "installed";
    },

    /**
     * Probes if a module is currently installed and ready for immediate execution.
     *
     * @param {string} moduleId
     * @returns {boolean}
     */
    isModuleInstalled(moduleId) {
      if (customIsModuleInstalled) {
        try {
          return Boolean(customIsModuleInstalled(moduleId));
        } catch {
          return false;
        }
      }
      if (customModuleState) {
        return this.moduleState(moduleId) === "installed";
      }
      return true;
    },

    onGeneratedOutput,
    sourceWorkflowNodeId,
    isEditorHost: true,
  });
}

/**
 * Creates an EditorHost adapter connected to a workflow store instance or state getter.
 * Used exclusively by application integration layers (e.g. use_editor_engine.js).
 *
 * @param {Object | Function} storeOrGetState - zustand store or getState function
 * @param {Object} [options]
 * @returns {Readonly<Object>}
 */
export function createWorkflowStoreEditorHost(storeOrGetState, options = {}) {
  const getState =
    typeof storeOrGetState === "function"
      ? storeOrGetState
      : typeof storeOrGetState?.getState === "function"
        ? () => storeOrGetState.getState()
        : () => storeOrGetState || {};

  return createEditorHost({
    resolveImage: (imageId) => {
      const state = getState();
      return state?.images?.[imageId] ?? null;
    },
    sourceWorkflowNodeId: options.sourceWorkflowNodeId ?? null,
    onGeneratedOutput: options.onGeneratedOutput ?? null,
    getImageBlobMap: options.getImageBlobMap ?? null,
    ...options,
  });
}

/**
 * Creates a standalone null EditorHost for headless unit tests or isolated environments.
 *
 * @param {Object} [options]
 * @returns {Readonly<Object>}
 */
export function createNullEditorHost(options = {}) {
  return createEditorHost(options);
}

/**
 * Validates that an object satisfies the EditorHost contract.
 *
 * @param {any} host
 * @returns {boolean}
 */
export function validateEditorHost(host) {
  if (!host || typeof host !== "object") {
    throw new TypeError(
      "Editor host must be a valid object implementing the EditorHost contract.",
    );
  }
  if (typeof host.resolveImage !== "function") {
    throw new TypeError(
      "Editor host must implement a resolveImage(imageId) function.",
    );
  }
  if (host.ensureModule && typeof host.ensureModule !== "function") {
    throw new TypeError(
      "Editor host ensureModule, if defined, must be a function.",
    );
  }
  return true;
}
