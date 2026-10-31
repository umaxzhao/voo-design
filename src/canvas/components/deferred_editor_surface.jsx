import PropTypes from "prop-types";
import GlobalOverlayPortal from "./global_overlay_portal.jsx";
import { Suspense, useLayoutEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "../use_i18n.js";

/** Pending surfaces own focus and dismissal before their implementation arrives. */
function PendingSurface({ onClose, position }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const { t } = useI18n();
  const menu = Boolean(position);
  useLayoutEffect(() => {
    const element = ref.current;
    const previous = document.activeElement;
    element?.focus();
    const keyDown = (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (["ArrowUp", "ArrowDown", "Home", "End", "Tab"].includes(event.key)) {
        event.preventDefault();
      }
    };
    const pointerDown = (event) => {
      if (!element?.contains(event.target)) closeRef.current();
    };
    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("pointerdown", pointerDown, true);
    return () => {
      document.removeEventListener("keydown", keyDown, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      if (previous?.isConnected &&
          (document.activeElement === element || document.activeElement === document.body)) {
        previous.focus?.();
      }
    };
  }, []);
  const spinner = (
    <div
      ref={ref}
      role={menu ? "menu" : "dialog"}
      aria-modal={menu ? undefined : true}
      aria-busy="true"
      aria-label={t("common.loading")}
      tabIndex={-1}
      data-testid="editor-surface-loading"
      className="flex items-center justify-center rounded-xl border border-white/10 bg-neutral-950 p-3 text-neutral-300 shadow-pop outline-none"
      style={menu ? {
        position: "fixed", zIndex: 100,
        left: `clamp(8px, ${position.x}px, calc(100vw - 48px))`,
        top: `clamp(8px, ${position.y}px, calc(100vh - 48px))`,
      } : undefined}
    >
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
    </div>
  );
  const overlay = menu ? spinner : (
    <div data-modal-overlay className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40">
      {spinner}
    </div>
  );
  return <GlobalOverlayPortal>{overlay}</GlobalOverlayPortal>;
}

const positionType = PropTypes.shape({ x: PropTypes.number.isRequired, y: PropTypes.number.isRequired });
PendingSurface.propTypes = { onClose: PropTypes.func.isRequired, position: positionType };

/** First use loads the feature; later closes retain its query and draft state. */
export default function DeferredEditorSurface({ open, onClose, position = null, children }) {
  const openedRef = useRef(false);
  if (open) openedRef.current = true;
  if (!openedRef.current) return null;
  return (
    <Suspense fallback={open ? <PendingSurface onClose={onClose} position={position} /> : null}>
      {children}
    </Suspense>
  );
}

DeferredEditorSurface.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  position: positionType,
  children: PropTypes.node.isRequired,
};
