import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { createEditorGestureTransaction } from "../../shared/editor-gesture-transaction.js";

const NUMBER_INPUT_GESTURE_KEY = "bounded-number-input";

export function evaluateMathExpression(str) {
  if (typeof str !== "string") return NaN;
  const trimmed = str.trim();
  if (!trimmed) return NaN;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (!/^[0-9+\-*/().\s]+$/.test(trimmed)) {
    return NaN;
  }
  try {
    const fn = new Function(`"use strict"; return (${trimmed});`);
    const val = fn();
    return typeof val === "number" && Number.isFinite(val) ? val : NaN;
  } catch {
    return NaN;
  }
}

/** Number input that validates on commit without blocking multi-digit typing. */
export default function BoundedNumberInput({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  onCommit = undefined,
  className = undefined,
  placeholder = undefined,
  ariaLabel,
  inputRef = undefined,
  disabled = false,
  precision = 0,
}) {
  const [draft, setDraft] = useState(String(value));
  const localInputRef = useRef(null);
  const setInputRef = (node) => {
    localInputRef.current = node;
    if (typeof inputRef === "function") {
      inputRef(node);
    } else if (inputRef && typeof inputRef === "object") {
      inputRef.current = node;
    }
  };
  const draftRef = useRef(String(value));
  const focusedRef = useRef(false);
  const committedValueRef = useRef(value);
  const emittedValueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const transactionRef = useRef(null);

  onCommitRef.current = onCommit;
  if (!transactionRef.current) {
    transactionRef.current = createEditorGestureTransaction({
      onCommit: () => onCommitRef.current?.(),
    });
  }

  useEffect(() => {
    if (!focusedRef.current) {
      const nextDraft = String(value);
      committedValueRef.current = value;
      emittedValueRef.current = value;
      if (draftRef.current !== nextDraft) {
        draftRef.current = nextDraft;
        setDraft(nextDraft);
      }
    }
    // Commit and immediate undo can publish the same value as the last render.
    // Reconcile every unfocused render, while preserving focused typing drafts.
  });

  // Integer fields keep the original `Math.round`; decimal fields opt in with
  // `precision` so line-height/letter-spacing can be typed instead of only
  // scrubbed (0.05 / 0.5 steps previously snapped to whole numbers).
  const roundToPrecision = (rawValue) => {
    const factor = 10 ** precision;
    return Math.round(rawValue * factor) / factor;
  };

  const normalize = (rawValue) => {
    const parsed = evaluateMathExpression(String(rawValue));
    const safeValue = Number.isFinite(parsed) ? parsed : value;
    return Math.min(max, Math.max(min, roundToPrecision(safeValue)));
  };

  const emitValue = (nextValue) => {
    if (nextValue === emittedValueRef.current) return false;
    emittedValueRef.current = nextValue;
    onValueChange(nextValue);
    return true;
  };

  const commit = () => {
    const nextValue = normalize(draftRef.current);
    const nextDraft = String(nextValue);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    const transaction = transactionRef.current;
    transaction.begin(NUMBER_INPUT_GESTURE_KEY);
    const changed = nextValue !== committedValueRef.current;
    transaction.setChanged(NUMBER_INPUT_GESTURE_KEY, changed);
    if (changed) emitValue(nextValue);
    committedValueRef.current = nextValue;
    // The interaction ended (blur, Enter or arrow): a changed value lands one
    // snapshot; a focus-only or reverted gesture lands none.
    return transaction.commit(NUMBER_INPUT_GESTURE_KEY);
  };

  return (
    <input
      type="text"
      role="spinbutton"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      ref={setInputRef}
      aria-label={ariaLabel}
      title={ariaLabel}
      disabled={disabled}
      className={className}
      onFocus={(event) => {
        focusedRef.current = true;
        transactionRef.current.begin(NUMBER_INPUT_GESTURE_KEY);
        // Select all text on focus so that typing replaces the existing value
        // rather than appending to it (e.g. clicking a field showing "0" then
        // typing "12" must produce "12", not "012" or "120").
        event.currentTarget.select();
      }}
      onChange={(event) => {
        transactionRef.current.begin(NUMBER_INPUT_GESTURE_KEY);
        const nextDraft = event.target.value;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        const parsed = evaluateMathExpression(nextDraft);
        if (
          nextDraft !== "" &&
          Number.isFinite(parsed) &&
          parsed >= min &&
          parsed <= max
        ) {
          emitValue(roundToPrecision(parsed));
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          // Commit the value then blur. Set focusedRef first so the subsequent
          // onBlur does not commit a second time (commit is idempotent but
          // setting the flag here keeps the logic explicit and cheaper).
          focusedRef.current = false;
          commit();
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          // Typing previews geometry live. Cancel must restore the value at
          // the last committed boundary before blur can commit the draft.
          const previousValue = committedValueRef.current;
          const previousDraft = String(previousValue);
          draftRef.current = previousDraft;
          setDraft(previousDraft);
          if (localInputRef.current) localInputRef.current.value = previousDraft;
          event.currentTarget.value = previousDraft;
          emitValue(previousValue);
          transactionRef.current.cancel(NUMBER_INPUT_GESTURE_KEY);
          focusedRef.current = false;
          event.currentTarget.blur();
          return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const stepMultiplier = event.shiftKey ? 10 : 1;
          const direction = event.key === "ArrowUp" ? 1 : -1;
          const currentVal = normalize(draftRef.current);
          const nextValue = Math.min(
            max,
            Math.max(min, roundToPrecision(currentVal + direction * stepMultiplier * step)),
          );
          const nextDraft = String(nextValue);
          draftRef.current = nextDraft;
          setDraft(nextDraft);
          emitValue(nextValue);
          commit();
        }
      }}
      onKeyUp={(event) => {
        event.stopPropagation();
      }}
    />
  );
}

BoundedNumberInput.propTypes = {
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  onValueChange: PropTypes.func.isRequired,
  /** Called when an interaction ends (blur, Enter, arrow step). */
  onCommit: PropTypes.func,
  className: PropTypes.string,
  ariaLabel: PropTypes.string.isRequired,
  inputRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
  disabled: PropTypes.bool,
  /** Decimal places kept when committing. 0 (default) keeps integer fields. */
  precision: PropTypes.number,
};
