import { describe, expect, it, vi } from "vitest";
import { activateMaskAction } from "../../src/canvas/components/editor_properties/properties_panel_header.jsx";

describe("PropertiesPanelHeader mask action", () => {
  it("edits an existing mask instead of creating another", () => {
    const maskActions = { onAddMask: vi.fn(), onEditToggle: vi.fn() };

    activateMaskAction(true, maskActions);

    expect(maskActions.onEditToggle).toHaveBeenCalledOnce();
    expect(maskActions.onAddMask).not.toHaveBeenCalled();
  });

  it("keeps the create path when no mask exists", () => {
    const maskActions = { onAddMask: vi.fn(), onEditToggle: vi.fn() };

    activateMaskAction(false, maskActions);

    expect(maskActions.onAddMask).toHaveBeenCalledOnce();
    expect(maskActions.onEditToggle).not.toHaveBeenCalled();
  });
});
