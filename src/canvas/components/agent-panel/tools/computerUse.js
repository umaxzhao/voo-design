import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { t } from "../../../../shared/i18n.js";
import {
  hasComputerUseBridge,
  isComputerUseEnabled,
} from "../../computer_use_plugin.js";

const OBSERVE_ACTIONS = [
  "capabilities",
  "permissions",
  "list-apps",
  "list-windows",
  "get-app-state",
];
const MUTATION_ACTIONS = [
  "click",
  "set-value",
  "type-text",
  "press-key",
  "hotkey",
  "paste-text",
  "scroll",
  "drag",
  "perform-secondary-action",
];

const parameters = (actions) => ({
  type: "object",
  properties: {
    action: { type: "string", enum: actions },
    app: {
      type: "string",
      description: "App bundle ID or unambiguous app name from list-apps.",
    },
    windowId: { type: "string" },
    windowIndex: { type: "number" },
    elementIndex: { type: "number" },
    x: { type: "number" },
    y: { type: "number" },
    fromX: { type: "number" },
    fromY: { type: "number" },
    toX: { type: "number" },
    toY: { type: "number" },
    fromElementIndex: { type: "number" },
    toElementIndex: { type: "number" },
    direction: { type: "string", enum: ["up", "down", "left", "right"] },
    key: { type: "string" },
    text: { type: "string" },
    mouseButton: { type: "string", enum: ["left", "right", "middle"] },
    modifiers: { type: "string" },
    secondaryAction: { type: "string" },
    restoreWindow: { type: "boolean" },
    noScreenshot: { type: "boolean" },
  },
  required: ["action"],
  additionalProperties: false,
});

async function invoke(args) {
  if (!isComputerUseEnabled() || !hasComputerUseBridge()) {
    throw new Error(t("nodeStore.computerUse.disabled"));
  }
  const result = await globalThis.vooDesktop.computerUse.invoke(args);
  return {
    ...result,
    screenshot: result?.screenshot?.dataUrl ?? null,
    screenshotScale: result?.screenshot?.scale ?? null,
  };
}

const sharedCapabilities = {
  externalData: true,
  estimatedCost: 0,
  reversible: null,
  timeout: 35_000,
};

export const computerObserveTool = {
  spec: {
    name: "computer_observe",
    description:
      "Observe a visible desktop app through VOO's Computer-use plugin. First list apps, then get fresh app/window state. Element indexes are short-lived; use the latest state. Screenshots are attached when the model supports vision.",
    parameters: parameters(OBSERVE_ACTIONS),
  },
  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,
  capabilities: { ...sharedCapabilities, mutates: false, idempotent: true },
  isAvailable: () => isComputerUseEnabled() && hasComputerUseBridge(),
  async execute(args) {
    if (!OBSERVE_ACTIONS.includes(args.action))
      throw new Error(t("nodeStore.computerUse.invalidAction"));
    return invoke(args);
  },
  presentCall: (args) => ({
    title: t("nodeStore.computerUse.call", { action: args.action }),
    icon: "eye",
  }),
  presentResult: () => ({ title: t("nodeStore.computerUse.observed") }),
};

export const computerActTool = {
  spec: {
    name: "computer_act",
    description:
      "Act on a visible desktop app through VOO's Computer-use plugin. Use fresh element indexes from computer_observe or prior action state. Inspect verification metadata and observe again when unverified. Never assume a submission or deletion succeeded without post-state evidence.",
    parameters: parameters(MUTATION_ACTIONS),
  },
  approvalLevel: TOOL_APPROVAL_LEVEL.REQUIRES_APPROVAL,
  capabilities: { ...sharedCapabilities, mutates: true, idempotent: false },
  isAvailable: () => isComputerUseEnabled() && hasComputerUseBridge(),
  async execute(args) {
    if (!MUTATION_ACTIONS.includes(args.action))
      throw new Error(t("nodeStore.computerUse.invalidAction"));
    return invoke(args);
  },
  presentCall: (args) => ({
    title: t("nodeStore.computerUse.call", { action: args.action }),
    icon: "mouse-pointer",
  }),
  presentResult: (_args, result) => ({
    title: result?.verification?.verified
      ? t("nodeStore.computerUse.verified")
      : t("nodeStore.computerUse.unverified"),
  }),
};
