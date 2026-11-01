import { describe, expect, it, vi } from "vitest";
import EditorHealingMenu from "../../src/canvas/components/editor_healing_menu.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: key => key }),
}));

describe("healing family primary action", () => {
  it.each(["patch", "spot", "clone", "aiRepair"])(
    "reactivates %s without silently selecting another repair mode", healingMode => {
      const onTool = vi.fn();
      const onHealingMode = vi.fn();
      const element = EditorHealingMenu({ tool: "select", healingMode, onTool, onHealingMode });
      const button = element.props.children.props.children;
      button.props.onClick();
      expect(onTool).toHaveBeenCalledWith("healing");
      expect(onHealingMode.mock.calls.every(([mode]) => mode === healingMode)).toBe(true);
    },
  );
});
