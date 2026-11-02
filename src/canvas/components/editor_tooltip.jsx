import PropTypes from "prop-types";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Floating tooltip for the image editor:
 * Shows a sleek, dark-styled tooltip with a subtle delay (default 350ms)
 * when hovering over buttons, tools, and options.
 */
export default function EditorTooltip({
  title,
  shortcut = "",
  side = "bottom",
  delay = 150,
  children,
  className = "",
  disabled = false,
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const timerRef = useRef(null);
  const tooltipId = useId();

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Position the tooltip against the trigger and reveal it. Shared by the
  // pointer and keyboard paths so both show the same tooltip.
  const show = () => {
    if (disabled || !title) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    let top = 0;
    let left = 0;
    const offset = 8;

    if (side === "top") {
      top = rect.top - offset;
      left = rect.left + rect.width / 2;
    } else if (side === "left") {
      top = rect.top + rect.height / 2;
      left = rect.left - offset;
    } else if (side === "right") {
      top = rect.top + rect.height / 2;
      left = rect.right + offset;
    } else {
      // bottom
      top = rect.bottom + offset;
      left = rect.left + rect.width / 2;
    }

    setPos({ top, left, side });
    setVisible(true);
  };

  const hide = () => {
    clearTimer();
    setVisible(false);
  };

  const handlePointerEnter = () => {
    if (disabled || !title) return;
    clearTimer();
    timerRef.current = setTimeout(show, delay);
  };

  const handlePointerLeave = () => {
    hide();
  };

  // Keyboard users get the same tooltip as pointer users: focus opens it and
  // blur closes it, mirroring InfoHint's focus behaviour.
  const handleFocus = () => {
    if (disabled || !title) return;
    clearTimer();
    show();
  };

  const handleBlur = () => {
    hide();
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  // Escape dismisses an open tooltip without moving focus.
  useEffect(() => {
    if (!visible) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        clearTimer();
        setVisible(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  let transform = "-translate-x-1/2";
  if (pos?.side === "top") transform = "-translate-x-1/2 -translate-y-full";
  if (pos?.side === "left") transform = "-translate-x-full -translate-y-1/2";
  if (pos?.side === "right") transform = "translate-y-[-50%]";

  return (
    <div
      ref={triggerRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-describedby={visible ? tooltipId : undefined}
      className={`inline-flex items-center justify-center ${className}`}
    >
      {children}
      {visible && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className={`pointer-events-none fixed z-[9999] flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-neutral-900/95 px-2.5 py-1 text-[11px] font-mono text-neutral-200 shadow-pop backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 ${transform}`}
              style={{
                top: `${pos.top}px`,
                left: `${pos.left}px`,
              }}
            >
              <span className="font-medium text-white">{title}</span>
              {shortcut ? (
                <kbd className="rounded-md bg-white/10 px-1 py-0.5 text-[9px] font-mono text-neutral-400">
                  {shortcut}
                </kbd>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

EditorTooltip.propTypes = {
  title: PropTypes.string,
  shortcut: PropTypes.string,
  side: PropTypes.oneOf(["top", "bottom", "left", "right"]),
  delay: PropTypes.number,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  disabled: PropTypes.bool,
};
