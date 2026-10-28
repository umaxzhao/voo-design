import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fields = vi.hoisted(() => []);

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

// Capture the boundary shared by the real effect and adjustment components.
// ScrubField's pointer/input implementation is exercised by browser checks;
// these tests ensure their parent never drops the live-edit or commit handler.
vi.mock("../../src/canvas/components/scrub_field.jsx", () => ({
  default: (props) => {
    fields.push(props);
    return null;
  },
}));

import LayerEffectsSection from "../../src/canvas/components/editor_properties/layer_effects_section.jsx";
import AffinityAdjustmentSection from "../../src/canvas/components/editor_properties/affinity_adjustment_section.jsx";
import { createAdjustmentNode } from "../../src/canvas/editor/scene_model.js";

const t = (key) => key;

function field(label) {
  const found = fields.find(({ ariaLabel }) => ariaLabel === label);
  expect(found, `Missing field: ${label}`).toBeDefined();
  return found;
}

beforeEach(() => {
  fields.length = 0;
});

describe("effect and adjustment commit contracts", () => {
  it("keeps layer blur live edits separate from the interaction commit", () => {
    const edit = vi.fn();
    const commitNow = vi.fn();
    const editAndCommit = vi.fn();
    renderToStaticMarkup(
      <LayerEffectsSection
        object={{ id: "shape", kind: "rect", layerBlur: 8 }}
        edit={edit}
        editAndCommit={editAndCommit}
        commitNow={commitNow}
      />,
    );

    const blur = field("editor.props.layerBlur");
    blur.onValueChange(12);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledWith({ layerBlur: 12 });
    expect(commitNow).not.toHaveBeenCalled();
    expect(editAndCommit).not.toHaveBeenCalled();
    blur.onCommit();
    expect(commitNow).toHaveBeenCalledTimes(1);
  });

  it("converts noise percentages while retaining the other noise fields", () => {
    const edit = vi.fn();
    const commitNow = vi.fn();
    renderToStaticMarkup(
      <LayerEffectsSection
        object={{
          id: "shape",
          kind: "rect",
          noise: { opacity: 0.15, density: 0.5, size: 2 },
        }}
        edit={edit}
        editAndCommit={vi.fn()}
        commitNow={commitNow}
      />,
    );

    const opacity = field("editor.props.noiseOpacity");
    expect(opacity.value).toBe(15);
    opacity.onValueChange(35);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledWith({
      noise: { opacity: 0.35, density: 0.5, size: 2 },
    });
    expect(commitNow).not.toHaveBeenCalled();
    opacity.onCommit();
    expect(commitNow).toHaveBeenCalledTimes(1);
  });

  it("edits a factory-created adjustment layer and forwards one commit", () => {
    const object = createAdjustmentNode({ adjustmentKind: "brightness" });
    const edit = vi.fn();
    const commitNow = vi.fn();
    const editAndCommit = vi.fn();
    expect(Array.isArray(object.adjustments)).toBe(false);
    renderToStaticMarkup(
      <AffinityAdjustmentSection
        object={object}
        adjustments={object.adjustments}
        edit={edit}
        editAndCommit={editAndCommit}
        commitNow={commitNow}
        t={t}
      />,
    );

    const brightness = field("editor.props.brightness");
    brightness.onValueChange(40);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledWith({
      adjustments: {
        ...object.adjustments,
        brightness: { ...object.adjustments.brightness, value: 40 },
      },
    });
    expect(object.adjustments.brightness.value).toBe(0);
    expect(commitNow).not.toHaveBeenCalled();
    expect(editAndCommit).not.toHaveBeenCalled();
    brightness.onCommit();
    expect(commitNow).toHaveBeenCalledTimes(1);
  });
});
