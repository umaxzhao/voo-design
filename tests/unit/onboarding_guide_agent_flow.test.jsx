import React from "react";
const hooks = vi.hoisted(() => ({ active: false, values: [], refs: [], refIndex: 0, index: 0 }));
// Run the guide's hooks against a plain array so its handlers can be driven in Node (no DOM).
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useState: (initial) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
      return [hooks.values[index], (value) => { hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value; }];
    },
    useRef: (value) => {
      if (!hooks.active) return actual.useRef(value);
      const index = hooks.refIndex++;
      return hooks.refs[index] ??= { current: value };
    },
    useCallback: (fn, deps) => (hooks.active ? fn : actual.useCallback(fn, deps)),
    useEffect: (...args) => { if (!hooks.active) actual.useEffect(...args); },
  };
});
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import OnboardingGuide from "../../src/canvas/components/onboarding/OnboardingGuide.jsx";
import StepAgentSelect from "../../src/canvas/components/onboarding/step_agent_select.jsx";
import StepLocalDetect from "../../src/canvas/components/onboarding/step_local_detect.jsx";
import StepReady from "../../src/canvas/components/onboarding/step_ready.jsx";
import { resetOnboarding } from "../../src/canvas/components/onboarding/onboarding_state.js";

function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
}

describe("onboarding guide agent selection flow", () => {
  let tree;
  const draw = () => { hooks.index = 0; hooks.refIndex = 0; tree = OnboardingGuide({ open: true, onClose: () => {} }); };
  const find = (type) => elements(tree).find((el) => el.type === type);
  const next = () => {
    elements(tree).find((el) => el.props?.["data-testid"] === "onboarding-next-btn").props.onClick();
    draw();
  };
  beforeEach(() => {
    resetOnboarding();
    hooks.active = true; hooks.values = []; hooks.refs = [];
    draw();
  });
  afterEach(() => { hooks.active = false; });

  it("defaults to Claude Code and carries a picked card to detection and the summary", () => {
    expect(find(StepAgentSelect).props.selectedAgent).toBe("claude");

    find(StepAgentSelect).props.onSelectAgent("codex");
    draw();
    expect(find(StepAgentSelect).props.selectedAgent).toBe("codex");

    next(); // agent select -> workspace
    next(); // workspace -> detect
    expect(find(StepLocalDetect).props.selectedAgent).toBe("codex");

    next(); // detect -> ready
    expect(find(StepReady).props.selectedAgent).toBe("codex");
  });

  it("keeps one frame size on every step", () => {
    const frame = () => elements(tree).find((el) => /h-\[min\(656px,90dvh\)\]/.test(el.props?.className ?? "")).props.className;
    const sizes = new Set([frame()]);
    for (let i = 0; i < 3; i += 1) { next(); sizes.add(frame()); }
    expect(sizes.size).toBe(1);
  });
});
