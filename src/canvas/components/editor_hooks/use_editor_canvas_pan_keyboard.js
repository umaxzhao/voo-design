import { useEffect } from "react";
import {
  isComposingKey,
  isPanControlTarget,
} from "../../../shared/keyboard-ownership.js";

/** Temporary pan owns Space only when canvas input, not a control or IME, owns it. */
export function useEditorCanvasPanKeyboard({
  enabled,
  freeStageRef,
  spaceRef,
}) {
  useEffect(() => {
    if (!enabled) return undefined;
    let composing = false;
    const onCompositionStart = () => {
      composing = true;
    };
    const onCompositionEnd = () => {
      composing = false;
    };
    const setHand = (active) => {
      spaceRef.current = active;
      const stage = freeStageRef.current;
      if (stage) stage.style.cursor = active ? "grab" : "default";
    };
    const onKeyDown = (event) => {
      if (event.code !== "Space") return;
      if (
        event.defaultPrevented ||
        isComposingKey(event, composing) ||
        isPanControlTarget(event.target)
      )
        return;
      event.preventDefault();
      setHand(true);
    };
    const onKeyUp = (event) => {
      if (event.code !== "Space") return;
      setHand(false);
    };
    const onBlur = () => {
      composing = false;
      setHand(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("compositionstart", onCompositionStart, true);
    window.addEventListener("compositionend", onCompositionEnd, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("compositionstart", onCompositionStart, true);
      window.removeEventListener("compositionend", onCompositionEnd, true);
      setHand(false);
    };
  }, [enabled, freeStageRef, spaceRef]);
}
