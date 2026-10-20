/**
 * Platform Capabilities Matrix (三端能力矩阵声明表)
 *
 * Single source of truth for cross-platform feature availability across
 * Chrome Extension, Electron Desktop, and Hosted Web (Standalone voo.run).
 *
 * SCOPE & CONTRACT:
 * - Pure data module (NO React, NO DOM, NO UI hooks).
 * - Usable directly in node:test, workers, and background scripts.
 * - Every cross-platform gated feature MUST declare:
 *   1. platforms: Array of supported CANVAS_MODE values.
 *   2. unavailableReasonKey: i18n key describing why it is unavailable when disabled.
 *   3. fallbackAction: optional string identifier for fallback behavior.
 */

import { CANVAS_MODE, getEnvironment } from "./environment.js";

/**
 * Standard capability identifiers.
 */
export const CAPABILITY = {
  AI_LAYER_SPLIT: "ai_layer_split",
  REVERSE_PROMPT: "reverse_prompt",
  CLIP_PIP_EXPORT: "clip_pip_export",
  NATIVE_MEDIA_SAVE_LOCATION: "native_media_save_location",
  BACKGROUND_AGENT: "background_agent",
  DESKTOP_INTEGRATIONS: "desktop_integrations",
  TRIPO_WEB: "tripo_web",
  TRIPO_WEB_GENERATION: "tripo_web",
};

/**
 * Three-platform capability registry.
 *
 * Environments:
 * - CANVAS_MODE.EXTENSION (local side-panel / tab)
 * - CANVAS_MODE.DESKTOP (Electron client)
 * - CANVAS_MODE.STANDALONE (voo.run hosted web without extension)
 * - CANVAS_MODE.FRAME (chat frame iframe)
 * - CANVAS_MODE.BRIDGE (voo.run with extension connected)
 */
export const PLATFORM_CAPABILITY_REGISTRY = {
  [CAPABILITY.AI_LAYER_SPLIT]: {
    name: "AI Layer Split",
    description:
      "Decompose flattened images into editable layers via web chat session / host platform",
    platforms: [
      CANVAS_MODE.EXTENSION,
      CANVAS_MODE.DESKTOP,
      CANVAS_MODE.FRAME,
      CANVAS_MODE.BRIDGE,
    ],
    unavailableReasonKey: "editor.taskbar.splitLayersUnavailableWeb",
  },
  [CAPABILITY.REVERSE_PROMPT]: {
    name: "Reverse Prompt",
    description:
      "Analyze image and generate reusable prompt template via connected AI platforms",
    platforms: [
      CANVAS_MODE.EXTENSION,
      CANVAS_MODE.DESKTOP,
      CANVAS_MODE.FRAME,
      CANVAS_MODE.BRIDGE,
    ],
    unavailableReasonKey: "node.reversePrompt.unavailableWeb",
  },
  [CAPABILITY.CLIP_PIP_EXPORT]: {
    name: "Clip Picture-in-Picture Export",
    description:
      "Compositing a secondary PiP video layer during export — Remotion headless rendering on desktop, Canvas 2D + MediaRecorder everywhere else (see video_combine.js)",
    platforms: [
      CANVAS_MODE.DESKTOP,
      CANVAS_MODE.STANDALONE,
      CANVAS_MODE.EXTENSION,
      CANVAS_MODE.FRAME,
      CANVAS_MODE.BRIDGE,
    ],
    unavailableReasonKey: "editor.clip.exportWebPipUnsupported",
  },
  [CAPABILITY.NATIVE_MEDIA_SAVE_LOCATION]: {
    name: "Native Media Save Location",
    description:
      "Choose a media export destination with the native save dialog; other environments use browser download preferences",
    platforms: [CANVAS_MODE.DESKTOP],
    unavailableReasonKey: "editor.exportBrowserLocation",
    fallbackAction: "browser_download",
  },
  [CAPABILITY.BACKGROUND_AGENT]: {
    name: "Background Agent Daemon",
    description:
      "Background execution daemon persists and runs agent tasks across tab reloads",
    platforms: [
      CANVAS_MODE.EXTENSION,
      CANVAS_MODE.DESKTOP,
      CANVAS_MODE.FRAME,
      CANVAS_MODE.BRIDGE,
    ],
    unavailableReasonKey: "agent.backgroundDaemonUnavailableWeb",
  },
  [CAPABILITY.DESKTOP_INTEGRATIONS]: {
    name: "Desktop Integrations",
    description: "Native desktop client integrations and launch orchestration",
    platforms: [CANVAS_MODE.DESKTOP],
    unavailableReasonKey: "agent.connection.requiresDesktopApp",
  },
  [CAPABILITY.TRIPO_WEB]: {
    name: "Tripo Web 3D Generation",
    description:
      "Generate 3D models via Tripo Web session automation requiring browser extension",
    platforms: [CANVAS_MODE.EXTENSION, CANVAS_MODE.FRAME, CANVAS_MODE.BRIDGE],
    unavailableReasonKey: "settings.modelRoutes.tripoWebNeedsExtension",
  },
};

/**
 * Check whether a capability is supported in the given environment mode (or active runtime).
 *
 * @param {string} capabilityId - One of CAPABILITY.*
 * @param {string} [mode] - Optional explicit CANVAS_MODE; defaults to current getEnvironment().mode
 * @returns {boolean}
 */
export function isCapabilitySupported(capabilityId, mode) {
  const cap = PLATFORM_CAPABILITY_REGISTRY[capabilityId];
  if (!cap) {
    throw new Error(`Unknown platform capability: "${capabilityId}"`);
  }
  const resolvedMode = mode ?? getEnvironment().mode;
  return cap.platforms.includes(resolvedMode);
}

/**
 * Query capability availability status and reason.
 *
 * @param {string} capabilityId - One of CAPABILITY.*
 * @param {string} [mode] - Optional explicit CANVAS_MODE; defaults to current getEnvironment().mode
 * @returns {{ supported: boolean, reasonKey: string | null }}
 */
export function getCapabilityStatus(capabilityId, mode) {
  const cap = PLATFORM_CAPABILITY_REGISTRY[capabilityId];
  if (!cap) {
    throw new Error(`Unknown platform capability: "${capabilityId}"`);
  }
  const resolvedMode = mode ?? getEnvironment().mode;
  const supported = cap.platforms.includes(resolvedMode);
  return {
    supported,
    reasonKey: supported ? null : cap.unavailableReasonKey,
  };
}

/**
 * Convenience helper to check if chat page automation (content script crawl)
 * is available. Equivalent to checking if not in standalone mode.
 *
 * @param {string} [mode]
 * @returns {boolean}
 */
export function isChatAutomationAvailable(mode) {
  const resolvedMode = mode ?? getEnvironment().mode;
  return resolvedMode !== CANVAS_MODE.STANDALONE;
}
