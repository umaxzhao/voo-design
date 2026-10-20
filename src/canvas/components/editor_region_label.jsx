import PropTypes from "prop-types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { REGION_COLOR } from "../editor/scene_model_core.js";
import {
  REGION_INTENTS,
  normalizeRegionIntent,
} from "../editor/scene_model.js";
import { useI18n } from "../use_i18n.js";

/** Matches the chip the renderer paints, so the field replaces it exactly. */
const CHIP_HEIGHT = 18;
const CHIP_FONT_SIZE = 11;
const CHIP_LINE_HEIGHT = 15;

/** How wide the field may grow before it wraps instead, in screen px. */
const MAX_WIDTH = 320;
const MIN_WIDTH = 150;

/**
 * What a region says, as a real `<textarea>`, plus an asteroid tool button
 * on the top right for quick AI actions (Cutout, Add Point, Repaint).
 */
export default function EditorRegionLabel({
  node,
  viewport,
  onCommit,
  onIntent,
}) {
  const { t } = useI18n();
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [value, setValue] = useState(node.label ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setRepaintPromptOpen] = useState(false);

  /** The live value, so a blur cannot commit a stale one. */
  const valueRef = useRef(value);
  valueRef.current = value;

  /**
   * True while an IME is mid-composition.
   */
  const composingRef = useRef(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.select();
  }, []);

  // Grow to fit whatever has been written, every time it changes.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(CHIP_HEIGHT, element.scrollHeight)}px`;
  }, [value]);

  // Committing on unmount covers every exit that is not a blur — the editor
  // closing, undo replacing the document, the region being deleted.
  useEffect(
    () => () => {
      onCommit(valueRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setRepaintPromptOpen(false);
      }
    };
    window.addEventListener("pointerdown", handleOutside, true);
    return () => window.removeEventListener("pointerdown", handleOutside, true);
  }, [menuOpen]);

  const left = node.x * viewport.zoom + viewport.panX;
  const top = node.y * viewport.zoom + viewport.panY;
  // Above the frame, unless it is against the top of the page — the same rule
  // the renderer follows when it paints the chip.
  const above = top - CHIP_HEIGHT - 2;

  const onKeyDown = (event) => {
    // The stage's shortcuts must not fire while typing.
    event.stopPropagation();

    if (composingRef.current || event.nativeEvent?.isComposing) return;

    if (event.key === "Escape") {
      event.preventDefault();
      valueRef.current = node.label ?? "";
      setValue(valueRef.current);
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const intent = normalizeRegionIntent(node.intent);
  const width = Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, (node.width ?? MIN_WIDTH) * viewport.zoom),
  );

  return (
    <>
      {/* Label and intent selection */}
      <div
        className="absolute z-20"
        style={{ left, top: above >= 0 ? above : top + 2, width }}
      >
        {onIntent ? (
          <div className="flex overflow-hidden rounded-t-md text-[10px] leading-none">
            {REGION_INTENTS.map((option) => (
              <button
                key={option}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onIntent(option)}
                className={`flex-1 px-1.5 py-1 transition-colors ${
                  option === intent
                    ? "bg-white/90 font-medium text-black"
                    : "bg-black/45 text-white/70 hover:bg-black/60 hover:text-white"
                }`}
              >
                {t(`editor.regionIntent.${option}`)}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={ref}
          value={value}
          rows={1}
          onChange={(event) => setValue(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onBlur={() => onCommit(valueRef.current)}
          onKeyDown={onKeyDown}
          placeholder={t("editor.regionPlaceholder")}
          aria-label={t("editor.regionLabel")}
          spellCheck={false}
          className="block w-full resize-none overflow-hidden border-none px-1.5 py-0 text-white outline-none placeholder:text-white/60"
          style={{
            minHeight: CHIP_HEIGHT,
            fontSize: CHIP_FONT_SIZE,
            lineHeight: `${CHIP_LINE_HEIGHT}px`,
            paddingTop: (CHIP_HEIGHT - CHIP_LINE_HEIGHT) / 2,
            fontWeight: 500,
            backgroundColor: REGION_COLOR,
            caretColor: "#ffffff",
          }}
        />
      </div>
    </>
  );
}

EditorRegionLabel.propTypes = {
  node: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    label: PropTypes.string,
    intent: PropTypes.string,
  }).isRequired,
  viewport: PropTypes.shape({
    zoom: PropTypes.number.isRequired,
    panX: PropTypes.number.isRequired,
    panY: PropTypes.number.isRequired,
  }).isRequired,
  onCommit: PropTypes.func.isRequired,
  onIntent: PropTypes.func,
  onCutout: PropTypes.func,
  onAddPoint: PropTypes.func,
  onRepaint: PropTypes.func,
  cutoutBusy: PropTypes.bool,
  repaintBusy: PropTypes.bool,
};
