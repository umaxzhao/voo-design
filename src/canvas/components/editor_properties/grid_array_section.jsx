/**
 * Grid array modifier control section.
 *
 * Supports both 2D canvas inspector and 3D scene properties inspector:
 * - Single source selection: Add/Enable, edit rows/cols (>= 1 integers),
 *   edit local step (X spacing between cols, Y spacing between rows),
 *   and optional 3D layers (>= 1 integer) + step Z for spatial/mesh3d nodes.
 * - Deterministic, single-undo-step commits on blur (Enter only triggers blur).
 * - Subscribes to engine.subscribeRender to ensure real-time synchronization on Undo/Redo or doc updates.
 */

import PropTypes from "prop-types";
import { useCallback, useEffect, useId, useState } from "react";
import { GRID_MODIFIER_TYPE } from "../../editor/scene-grid-array.js";
import {
  addGridArrayModifier,
  updateGridArrayModifier,
  removeGridArrayModifier,
} from "../../editor/doc-ops-grid-array.js";
import { CollapsibleSection } from "./property_section.jsx";
import { InspectorGroup } from "../inspector_primitives.jsx";
import { IconGrid3x3, IconTrash } from "../../icons.jsx";

const FIELD_CLASS =
  "h-7 w-full min-w-0 rounded-xl bg-neutral-800 px-2 text-[11px] font-mono tabular-nums text-neutral-100 outline-none transition-colors hover:bg-neutral-800/80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";
const ERROR_FIELD_CLASS =
  "h-7 w-full min-w-0 rounded-xl bg-neutral-800 px-2 text-[11px] font-mono tabular-nums text-rose-300 outline-none ring-1 ring-rose-500/60 focus-visible:ring-1 focus-visible:ring-rose-400";

function NumberInput({
  label,
  value,
  min,
  max,
  isInteger = false,
  step = 1,
  onChange,
  ariaLabel,
  testId,
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(String(value ?? 0));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setDraft(String(value ?? 0));
    setHasError(false);
  }, [value]);

  const commit = useCallback(() => {
    const raw = draft.trim();
    const num = Number(raw);

    if (raw === "" || !Number.isFinite(num)) {
      setHasError(true);
      setDraft(String(value ?? 0));
      return;
    }

    if (isInteger && !Number.isInteger(num)) {
      setHasError(true);
      setDraft(String(value ?? 0));
      return;
    }

    if ((min !== undefined && num < min) || (max !== undefined && num > max)) {
      setHasError(true);
      setDraft(String(value ?? 0));
      return;
    }

    setHasError(false);
    setDraft(String(num));
    if (num !== value) {
      onChange(num);
    }
  }, [draft, value, min, max, isInteger, onChange]);

  return (
    <label
      htmlFor={inputId}
      className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400"
    >
      <span className="w-16 shrink-0 truncate">{label}</span>
      <input
        id={inputId}
        data-testid={testId}
        type="number"
        aria-label={ariaLabel || label}
        aria-invalid={hasError ? "true" : "false"}
        className={hasError ? ERROR_FIELD_CLASS : FIELD_CLASS}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setHasError(false);
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

NumberInput.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number,
  max: PropTypes.number,
  isInteger: PropTypes.bool,
  step: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string,
  testId: PropTypes.string,
};

export default function GridArraySection({
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
    if (!engine || typeof engine.subscribeRender !== "function") return;
    const unsubscribe = engine.subscribeRender(() => {
      setRenderTicket((prev) => prev + 1);
    }, { documentOnly: true });
    return unsubscribe;
  }, [engine]);

  const currentDoc = engine?.getDocument?.() ?? doc ?? null;
  const modifiers = currentDoc?.modifiers ?? [];
  const activeModifier = modifiers.find(
    (m) => m.targetId === targetId && m.type === GRID_MODIFIER_TYPE,
  );

  const handleAdd = useCallback(() => {
    if (!targetId) return;
    const initialStep = is3d ? { x: 50, y: 50, z: 30 } : { x: 50, y: 50, z: 0 };
    const params = {
      targetId,
      rows: 2,
      cols: 2,
      layers: is3d ? 2 : 1,
      step: initialStep,
    };
    if (engine && typeof engine.addGridArrayModifier === "function") {
      engine.addGridArrayModifier(params);
    } else if (currentDoc && engine) {
      addGridArrayModifier(engine, params);
    }
  }, [targetId, is3d, engine, currentDoc]);

  const handleUpdate = useCallback(
    (patch) => {
      const docNow = engine?.getDocument?.() ?? currentDoc;
      const modNow =
        docNow?.modifiers?.find(
          (m) => m.targetId === targetId && m.type === GRID_MODIFIER_TYPE,
        ) ?? activeModifier;
      if (!modNow) return;
      if (engine && typeof engine.updateGridArrayModifier === "function") {
        engine.updateGridArrayModifier(modNow.id, patch);
      } else if (docNow && engine) {
        updateGridArrayModifier(engine, modNow.id, patch);
      }
    },
    [targetId, activeModifier, engine, currentDoc],
  );

  const handleRemove = useCallback(() => {
    if (!activeModifier) return;
    if (engine && typeof engine.removeGridArrayModifier === "function") {
      engine.removeGridArrayModifier(activeModifier.id);
    } else if (currentDoc && engine) {
      removeGridArrayModifier(engine, activeModifier.id);
    }
  }, [activeModifier, engine, currentDoc]);

  if (!targetId) return null;

  const evaluatedModifier = activeModifier;



  const content = !activeModifier ? (
    <button
      type="button"
      data-testid="editor-grid-array-enable"
      onClick={handleAdd}
      className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] px-2 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
    >
      <IconGrid3x3 size={12} strokeWidth={1.5} />
      <span>{t("editor.gridArray.add")}</span>
    </button>
  ) : (
    <div
      className="flex flex-col gap-2"
      data-testid="editor-grid-array-controls"
    >
      <NumberInput
        label={t("editor.gridArray.rows")}
        value={activeModifier.rows}
        min={1}
        isInteger={true}
        step={1}
        testId="editor-grid-array-rows"
        ariaLabel={t("editor.gridArray.rows")}
        onChange={(rows) => handleUpdate({ rows })}
      />
      <NumberInput
        label={t("editor.gridArray.cols")}
        value={activeModifier.cols}
        min={1}
        isInteger={true}
        step={1}
        testId="editor-grid-array-cols"
        ariaLabel={t("editor.gridArray.cols")}
        onChange={(cols) => handleUpdate({ cols })}
      />
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <NumberInput
            label={t("editor.gridArray.stepX")}
            value={activeModifier.step?.x ?? 0}
            step={1}
            testId="editor-grid-array-step-x"
            ariaLabel={t("editor.gridArray.stepX")}
            onChange={(x) => handleUpdate({ step: { ...activeModifier.step, x: x } })}
          />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <NumberInput
            label={t("editor.gridArray.stepY")}
            value={activeModifier.step?.y ?? 0}
            step={1}
            testId="editor-grid-array-step-y"
            ariaLabel={t("editor.gridArray.stepY")}
            onChange={(y) => handleUpdate({ step: { ...activeModifier.step, y: y } })}
          />
        </div>
      </div>
      {is3d ? (
        <>
          <NumberInput
            label={t("editor.gridArray.layers")}
            value={activeModifier.layers ?? 1}
            min={1}
            isInteger={true}
            step={1}
            testId="editor-grid-array-layers"
            ariaLabel={t("editor.gridArray.layers")}
            onChange={(layers) => handleUpdate({ layers })}
          />
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <NumberInput
                label={t("editor.gridArray.stepZ")}
                value={
                  activeModifier.step?.z ?? 0
                }
                step={1}
                testId="editor-grid-array-step-z"
                ariaLabel={t("editor.gridArray.stepZ")}
                onChange={(z) => handleUpdate({ step: { ...activeModifier.step, z: z } })}
              />
            </div>
          </div>
        </>
      ) : null}
      {!embedded ? <button
        type="button"
        data-testid="editor-grid-array-remove"
        onClick={handleRemove}
        className="mt-1 flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500/10 px-2 text-[11px] font-medium text-rose-400 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400"
      >
        <IconTrash className="text-neutral-400" size={12} strokeWidth={1.5} />
        <span>{t("editor.gridArray.remove")}</span>
      </button> : null}
    </div>
  );

  if (embedded) return activeModifier ? content : null;

  if (is3d) {
    return (
      <InspectorGroup
        title={t("editor.gridArray.title")}
        defaultOpen={true}
        testId="editor-three-grid-array-group"
      >
        {content}
      </InspectorGroup>
    );
  }

  return (
    <CollapsibleSection
      title={t("editor.gridArray.title")}
      defaultOpen={true}
      testId="editor-grid-array-section"
      storageKey="gridArray.section"
    >
      {content}
    </CollapsibleSection>
  );
}

GridArraySection.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
  doc: PropTypes.object,
  is3d: PropTypes.bool,
  embedded: PropTypes.bool,
  t: PropTypes.func.isRequired,
};
