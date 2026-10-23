/**
 * Circular array properties section.
 *
 * Mirrors `LinearArraySection` in structure and engine usage so a circular array is edited through the same
 * inspector surface as a linear one. The four controls are the whole feature: count, radius, start angle and
 * arc span. There is deliberately NO animation control, because the modifier kind has no supported animated
 * property — offering a keyframe affordance here would be exactly the false affordance this project has
 * already been burned by.
 *
 * @module circular_array_section
 */

import PropTypes from "prop-types";
import { useCallback, useEffect, useState } from "react";
import { CIRCULAR_MODIFIER_TYPE } from "../../editor/scene-circular-array-validation.js";
import {
  addCircularArrayModifier,
  updateCircularArrayModifier,
  removeCircularArrayModifier,
} from "../../editor/doc-ops-circular-array.js";
import { CollapsibleSection } from "./property_section.jsx";
import { InspectorGroup } from "../inspector_primitives.jsx";
import { IconTrash } from "../../icons.jsx";

const DEFAULT_RADIUS = 100;
const DEFAULT_ARC_SPAN = 360;

function NumberInput({ label, value, min, max, step = 1, onChange, testId }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] text-neutral-400">{label}</span>
      <input
        type="number"
        data-testid={testId}
        className="w-20 rounded-lg bg-neutral-800 px-2 py-1 text-right text-[12px] text-neutral-100 tabular-nums"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

NumberInput.propTypes = {
  testId: PropTypes.string,
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  onChange: PropTypes.func.isRequired,
};

export default function CircularArraySection({
  object,
  engine = null,
  doc = null,
  is3d = false,
  embedded = false,
  t,
}) {
  const targetId = object?.id;
  const [, setRenderTicket] = useState(0);

  useEffect(() => {
    if (!engine || typeof engine.subscribeRender !== "function")
      return undefined;
    const unsubscribe = engine.subscribeRender(() =>
      setRenderTicket((n) => n + 1),
      { documentOnly: true },
    );
    return unsubscribe;
  }, [engine]);

  const currentDoc = engine?.getDocument?.() ?? doc ?? null;
  const modifiers = currentDoc?.modifiers ?? [];
  const activeModifier = modifiers.find(
    (m) => m.targetId === targetId && m.type === CIRCULAR_MODIFIER_TYPE,
  );

  const readModifier = useCallback(() => {
    const docNow = engine?.getDocument?.() ?? currentDoc;
    return (
      docNow?.modifiers?.find(
        (m) => m.targetId === targetId && m.type === CIRCULAR_MODIFIER_TYPE,
      ) ?? activeModifier
    );
  }, [targetId, activeModifier, engine, currentDoc]);

  const handleAdd = useCallback(() => {
    if (!targetId) return;
    const params = {
      targetId,
      count: 2,
      radius: DEFAULT_RADIUS,
      startAngle: 0,
      arcSpan: DEFAULT_ARC_SPAN,
    };
    if (engine && typeof engine.addCircularArrayModifier === "function") {
      engine.addCircularArrayModifier(params);
    } else if (currentDoc && engine) {
      addCircularArrayModifier(engine, params);
    }
  }, [targetId, engine, currentDoc]);

  const handleUpdate = useCallback(
    (patch) => {
      const modNow = readModifier();
      if (!modNow) return;
      if (engine && typeof engine.updateCircularArrayModifier === "function") {
        engine.updateCircularArrayModifier(modNow.id, patch);
      } else {
        const docNow = engine?.getDocument?.() ?? currentDoc;
        if (docNow && engine)
          updateCircularArrayModifier(engine, modNow.id, patch);
      }
    },
    [readModifier, engine, currentDoc],
  );

  const handleRemove = useCallback(() => {
    const modNow = readModifier();
    if (!modNow) return;
    if (engine && typeof engine.removeCircularArrayModifier === "function") {
      engine.removeCircularArrayModifier(modNow.id);
    } else {
      const docNow = engine?.getDocument?.() ?? currentDoc;
      if (docNow && engine) removeCircularArrayModifier(engine, modNow.id);
    }
  }, [readModifier, engine, currentDoc]);

  if (!targetId) return null;

  // The circular array animates ONLY radius and startAngle, through the same accepted mechanism the linear
  // array uses for its step. `count` and `arcSpan` are structural and deliberately have no motion control
  // here, which is why an animation on either is rejected rather than silently ignored.
  const evaluatedModifier = activeModifier;


  const content = (
    <div data-modifier={activeModifier ? "present" : "absent"}>
      {!activeModifier ? (
        <button
          type="button"
          data-testid="editor-circular-array-enable"
          className="w-full rounded-lg bg-neutral-800 px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-white/[0.08]"
          onClick={handleAdd}
        >
          {t("editor.circularArray.add")}
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          <NumberInput
            testId="editor-circular-array-count"
            label={t("editor.circularArray.count")}
            value={activeModifier.count}
            min={1}
            step={1}
            onChange={(count) => handleUpdate({ count: Math.round(count) })}
          />
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <NumberInput
                testId="editor-circular-array-radius"
                label={t("editor.circularArray.radius")}
                value={activeModifier.radius}
                min={0}
                step={1}
                onChange={(radius) =>
                  handleUpdate({ radius })
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <NumberInput
                testId="editor-circular-array-start-angle"
                label={t("editor.circularArray.startAngle")}
                value={activeModifier.startAngle}
                step={1}
                onChange={(startAngle) =>
                  handleUpdate({ startAngle })
                }
              />
            </div>
          </div>
          <NumberInput
            testId="editor-circular-array-arc-span"
            label={t("editor.circularArray.arcSpan")}
            value={activeModifier.arcSpan}
            min={0}
            max={360}
            step={1}
            onChange={(arcSpan) => handleUpdate({ arcSpan })}
          />
          {!embedded ? <button
            type="button"
            data-testid="editor-circular-array-remove"
            className="mt-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-[11px] text-neutral-400 hover:bg-white/[0.08]"
            onClick={handleRemove}
          >
            <IconTrash size={14} strokeWidth={1.5} />
            {t("editor.circularArray.remove")}
          </button> : null}
        </div>
      )}
    </div>
  );

  // The 3D properties panel is a different entry point from the 2D one: it renders an InspectorGroup whose
  // testid the native browser fixture keys on. Without this split the section simply is not reachable from
  // the 3D panel, which is why a model3d node in a 2D document could never be genuine native 3D.
  if (embedded) return activeModifier ? content : null;

  if (is3d) {
    return (
      <InspectorGroup
        title={t("editor.circularArray.title")}
        defaultOpen={true}
        testId="editor-three-circular-array-group"
      >
        {content}
      </InspectorGroup>
    );
  }
  return (
    <CollapsibleSection
      title={t("editor.circularArray.title")}
      defaultOpen={true}
      testId="editor-circular-array-section"
      storageKey="circularArray.section"
    >
      {content}
    </CollapsibleSection>
  );
}

CircularArraySection.propTypes = {
  object: PropTypes.shape({ id: PropTypes.string }),
  is3d: PropTypes.bool,
  embedded: PropTypes.bool,
  engine: PropTypes.object,
  doc: PropTypes.object,
  t: PropTypes.func.isRequired,
};
