/**
 * Linear array modifier control section.
 *
 * Supports both 2D canvas inspector and 3D scene properties inspector:
 * - Single source selection: Add/Enable, edit count (>= 1, total count including source),
 *   edit local step (X, Y, and optional Z for 3D/mesh3d nodes), and Remove.
 * - Deterministic, single-undo-step commits on blur (Enter only triggers blur to avoid dual commits).
 * - Subscribes to engine.subscribeRender to ensure real-time synchronization on Undo/Redo or external doc changes.
 */

import PropTypes from "prop-types";
import { useCallback, useEffect, useId, useState } from "react";
import { MODIFIER_TYPE } from "../../editor/scene-linear-array-validation.js";
import {
  addLinearArrayModifier,
  updateLinearArrayModifier,
  removeLinearArrayModifier,
} from "../../editor/doc-ops-linear-array.js";
import { CollapsibleSection } from "./property_section.jsx";
import { InspectorGroup } from "../inspector_primitives.jsx";
import { IconCopy, IconTrash } from "../../icons.jsx";

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

    // Validate finite number
    if (raw === "" || !Number.isFinite(num)) {
      setHasError(true);
      setDraft(String(value ?? 0));
      return;
    }

    // Validate integer if required
    if (isInteger && !Number.isInteger(num)) {
      setHasError(true);
      setDraft(String(value ?? 0));
      return;
    }

    // Validate bounds
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
            // Sole commit occurs through blur event handler
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

export default function LinearArraySection({
  object,
  engine = null,
  doc = null,
  is3d = false,
  t,
}) {
  const targetId = object?.id;

  // Active sync state: tracks doc changes directly via engine.subscribeRender
  const [, setRenderTicket] = useState(0);
  useEffect(() => {
    if (!engine || typeof engine.subscribeRender !== "function") return;
    const unsubscribe = engine.subscribeRender(() => {
      setRenderTicket((t) => t + 1);
    });
    return unsubscribe;
  }, [engine]);

  const currentDoc = engine?.getDocument?.() ?? doc ?? null;
  const modifiers = currentDoc?.modifiers ?? [];
  const activeModifier = modifiers.find(
    (m) => m.targetId === targetId && m.type === MODIFIER_TYPE.LINEAR_ARRAY,
  );

  const handleAdd = useCallback(() => {
    if (!targetId) return;
    const initialStep = is3d ? { x: 50, y: 0, z: 30 } : { x: 50, y: 0, z: 0 };
    if (engine && typeof engine.addLinearArrayModifier === "function") {
      engine.addLinearArrayModifier({
        targetId,
        count: 2,
        step: initialStep,
      });
    } else if (currentDoc && engine) {
      addLinearArrayModifier(engine, {
        targetId,
        count: 2,
        step: initialStep,
      });
    }
  }, [targetId, is3d, engine, currentDoc]);

  const handleUpdate = useCallback(
    (patch) => {
      const docNow = engine?.getDocument?.() ?? currentDoc;
      const modNow =
        docNow?.modifiers?.find(
          (m) =>
            m.targetId === targetId && m.type === MODIFIER_TYPE.LINEAR_ARRAY,
        ) ?? activeModifier;
      if (!modNow) return;
      if (engine && typeof engine.updateLinearArrayModifier === "function") {
        engine.updateLinearArrayModifier(modNow.id, patch);
      } else if (docNow && engine) {
        updateLinearArrayModifier(engine, modNow.id, patch);
      }
    },
    [targetId, activeModifier, engine, currentDoc],
  );

  const handleRemove = useCallback(() => {
    if (!activeModifier) return;
    if (engine && typeof engine.removeLinearArrayModifier === "function") {
      engine.removeLinearArrayModifier(activeModifier.id);
    } else if (currentDoc && engine) {
      removeLinearArrayModifier(engine, activeModifier.id);
    }
  }, [activeModifier, engine, currentDoc]);

  if (!targetId) return null;

  const evaluatedModifier = activeModifier;



  const content = !activeModifier ? (
    <button
      type="button"
      data-testid="editor-linear-array-enable"
      onClick={handleAdd}
      className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] px-2 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
    >
      <IconCopy size={12} strokeWidth={1.5} />
      <span>{t("editor.linearArray.add")}</span>
    </button>
  ) : (
    <div
      className="flex flex-col gap-2"
      data-testid="editor-linear-array-controls"
    >
      <NumberInput
        label={t("editor.linearArray.count")}
        value={activeModifier.count}
        min={1}
        isInteger={true}
        step={1}
        testId="editor-linear-array-count"
        ariaLabel={t("editor.linearArray.count")}
        onChange={(count) => handleUpdate({ count })}
      />
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <NumberInput
            label={t("editor.linearArray.stepX")}
            value={activeModifier.step?.x ?? 0}
            step={1}
            testId="editor-linear-array-step-x"
            ariaLabel={t("editor.linearArray.stepX")}
            onChange={(x) => handleUpdate({ step: { ...activeModifier.step, x: x } })}
          />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <NumberInput
            label={t("editor.linearArray.stepY")}
            value={activeModifier.step?.y ?? 0}
            step={1}
            testId="editor-linear-array-step-y"
            ariaLabel={t("editor.linearArray.stepY")}
            onChange={(y) => handleUpdate({ step: { ...activeModifier.step, y: y } })}
          />
        </div>
      </div>
      {is3d ? (
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <NumberInput
              label={t("editor.linearArray.stepZ")}
              value={activeModifier.step?.z ?? 0}
              step={1}
              testId="editor-linear-array-step-z"
              ariaLabel={t("editor.linearArray.stepZ")}
              onChange={(z) => handleUpdate({ step: { ...activeModifier.step, z: z } })}
            />
          </div>
        </div>
      ) : null}
      <button
        type="button"
        data-testid="editor-linear-array-remove"
        onClick={handleRemove}
        className="mt-1 flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500/10 px-2 text-[11px] font-medium text-rose-400 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400"
      >
        <IconTrash size={12} strokeWidth={1.5} />
        <span>{t("editor.linearArray.remove")}</span>
      </button>
    </div>
  );

  if (is3d) {
    return (
      <InspectorGroup
        title={t("editor.linearArray.title")}
        defaultOpen={true}
        testId="editor-three-linear-array-group"
      >
        {content}
      </InspectorGroup>
    );
  }

  return (
    <CollapsibleSection
      title={t("editor.linearArray.title")}
      defaultOpen={true}
      testId="editor-linear-array-section"
      storageKey="linearArray.section"
    >
      {content}
    </CollapsibleSection>
  );
}

LinearArraySection.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
  doc: PropTypes.object,
  is3d: PropTypes.bool,
  t: PropTypes.func.isRequired,
};
