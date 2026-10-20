import PropTypes from "prop-types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LINE_HEIGHT_RATIO } from "../editor/scene_model_core.js";

/**
 * The text caret, as a real `<textarea>` laid over the canvas.
 *
 * Drawing a caret and a selection onto the canvas would mean reimplementing
 * text input — including IME composition, which matters as soon as anyone
 * types Chinese. Instead the node is hidden from the canvas while a textarea
 * sits exactly where it was drawn, styled to match, so the browser handles
 * carets, selection, clipboard and composition and the visual is unchanged.
 */
export default function EditorTextOverlay({
  node,
  viewport,
  onCommit,
  onUpdate,
}) {
  const ref = useRef(null);
  const [value, setValue] = useState(node.text ?? "");
  /** The live value, so the blur handler cannot commit a stale one. */
  const valueRef = useRef(value);
  valueRef.current = value;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.select();
  }, []);

  // Committing on unmount covers every exit that is not a blur — the tool
  // changing, the editor closing, undo replacing the document. An empty
  // value is the one exception: committing it deletes the node, and React
  // StrictMode's dev-only remount fires this cleanup with the untouched
  // empty value, which would discard a fresh box before anyone typed into
  // it. Real "emptied and done" exits all pass through the blur commit.
  useEffect(
    () => () => {
      if (valueRef.current !== "") onCommit(valueRef.current);
    },
    // Re-running this on a new `onCommit` identity would commit mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const fontSize = node.fontSize * viewport.zoom;
  const lineHeight = node.lineHeight ?? LINE_HEIGHT_RATIO;
  const rotation = node.rotation ?? 0;
  const shear = node.shear ?? 0;
  const fixedBox = (node.boxWidth ?? 0) > 0;
  const vertical = node.direction === "vertical";

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => {
        const nextVal = event.target.value;
        setValue(nextVal);
        // Dynamically update text node box in real-time without quitting editing mode
        if (node.id && onUpdate) {
          onUpdate(nextVal);
        }
      }}
      onBlur={() => onCommit(valueRef.current)}
      onKeyDown={(event) => {
        // An IME composition owns every key while composing — Escape picks a
        // candidate (macOS) and Windows fires keystrokes with keyCode 229.
        // Guard like the rest of the codebase (ime_textarea.jsx) so a
        // composition like selecting a candidate never commits and closes.
        if (event.nativeEvent.isComposing || event.keyCode === 229) {
          event.stopPropagation();
          return;
        }
        // Cmd+Enter / Ctrl+Enter or Escape finishes text editing and commits value
        const isCmdOrCtrl = event.metaKey || event.ctrlKey;
        if (event.key === "Escape" || (event.key === "Enter" && isCmdOrCtrl)) {
          event.preventDefault();
          event.currentTarget.blur();
          return;
        }
        // The stage's shortcuts must not fire while typing.
        event.stopPropagation();
      }}
      spellCheck={false}
      rows={1}
      className={`absolute z-20 resize-none overflow-hidden border-none bg-transparent p-0 outline-none ${
        // A fixed text box wraps live like the committed canvas render;
        // auto-width point text keeps the historical single-line behaviour.
        fixedBox ? "whitespace-pre-wrap break-words" : "whitespace-pre"
      }`}
      style={{
        left: node.x * viewport.zoom + viewport.panX,
        top: node.y * viewport.zoom + viewport.panY,
        // A fixed box never widens under the caret; the canvas draws the same
        // box so editing must not reframe it.
        width: fixedBox
          ? node.boxWidth * viewport.zoom
          : Math.max(node.width * viewport.zoom, fontSize),
        // Auto height grows the box with wrapped lines as the user types; the
        // committed canvas render measures the same wrap, and the box starts
        // no shorter than that last measured height.
        height: "auto",
        minHeight: Math.max(node.height * viewport.zoom, fontSize * lineHeight),
        color: node.fill,
        fontFamily: node.fontFamily,
        fontSize,
        // Weight / style / align / spacing / line height / direction mirror
        // the renderer exactly, so entering or leaving an edit never makes
        // the text jump. Stroke, shadow and highlight have no faithful
        // textarea equivalent; they only exist in the committed canvas render.
        fontWeight: node.fontWeight ?? "normal",
        fontStyle: node.italic ? "italic" : "normal",
        textAlign: node.align ?? "left",
        letterSpacing: (node.letterSpacing ?? 0) * viewport.zoom,
        lineHeight,
        caretColor: node.fill,
        // 直排: stack the characters and advance the columns with the same
        // right-to-left flow the canvas painter uses (vertical-rl).
        writingMode: vertical ? "vertical-rl" : "horizontal-tb",
        // Mirror the node's render transform: rotation then horizontal shear
        // about the box centre — the same T(c)·R·S·T(-c) chain
        // scene_geometry defines, which CSS spells as rotate()·skewX() with
        // transform-origin: center. Zoom composes because every length above
        // is already zoom-scaled and the box centre is the node's centre.
        ...(rotation || shear || node.flipH || node.flipV
          ? {
              transform: `rotate(${rotation}deg) skewX(${shear}deg) scale(${node.flipH ? -1 : 1}, ${node.flipV ? -1 : 1})`,
              transformOrigin: "center",
            }
          : {}),
      }}
    />
  );
}

EditorTextOverlay.propTypes = {
  node: PropTypes.shape({
    id: PropTypes.string,
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    text: PropTypes.string,
    fill: PropTypes.string,
    fontSize: PropTypes.number.isRequired,
    fontFamily: PropTypes.string,
    fontWeight: PropTypes.string,
    italic: PropTypes.bool,
    align: PropTypes.string,
    letterSpacing: PropTypes.number,
    lineHeight: PropTypes.number,
    boxWidth: PropTypes.number,
    direction: PropTypes.string,
    rotation: PropTypes.number,
    shear: PropTypes.number,
    flipH: PropTypes.bool,
    flipV: PropTypes.bool,
  }).isRequired,
  viewport: PropTypes.shape({
    zoom: PropTypes.number.isRequired,
    panX: PropTypes.number.isRequired,
    panY: PropTypes.number.isRequired,
  }).isRequired,
  onUpdate: PropTypes.func,
  onCommit: PropTypes.func.isRequired,
};
