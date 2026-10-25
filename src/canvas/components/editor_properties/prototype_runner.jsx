/**
 * Prototype runner (MVP): plays frame-to-frame interactions in a fullscreen
 * overlay. Frames are rasterised through the existing export pipeline, so the
 * preview is exactly what Present/Export would show; interactions become
 * clickable hotspots on top, positioned in frame-relative percentages.
 *
 * Actions: navigate, back, open overlay, close overlay. Page changes play the
 * declared transition (dissolve / move-*), overlays fade in above the page.
 */

import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../use_i18n.js";
import {
  frameSubtreeIds,
  hotspotRect,
  interactionsInFrame,
  prototypeFrames,
} from "../../editor/prototype_model.js";
import { IconClose, IconChevronLeft, IconRefresh } from "../../icons.jsx";

const BAR_CLASS = "flex items-center gap-2 px-3 py-2";
const OVERLAY_WIDTH = 0.62;

function frameImage(engine, doc, frameId) {
  if (!frameId || !engine?.exportSelectionPng) return null;
  const ids = frameSubtreeIds(doc, frameId);
  const result = engine.exportSelectionPng(ids, {
    scale: 1,
    transparent: false,
  });
  return typeof result === "string" ? result : result?.dataUrl ?? null;
}

function enterTransform(transition) {
  switch (transition) {
    case "move-left":
      return "translateX(8%)";
    case "move-right":
      return "translateX(-8%)";
    case "move-up":
      return "translateY(8%)";
    case "move-down":
      return "translateY(-8%)";
    default:
      return "none";
  }
}

function Hotspots({ doc, frameId, onAction }) {
  const { t } = useI18n();
  const interactions = interactionsInFrame(doc, frameId)
    .map((interaction) => ({ interaction, rect: hotspotRect(doc, interaction) }))
    .filter((entry) => entry.rect && entry.rect.width > 0 && entry.rect.height > 0);
  // Frame-level hotspots sit below layer hotspots so a child can win the click.
  interactions.sort((a, b) => {
    const aFrame = a.interaction.sourceId === frameId ? 1 : 0;
    const bFrame = b.interaction.sourceId === frameId ? 1 : 0;
    return aFrame - bFrame;
  });
  return interactions.map(({ interaction, rect }) => (
    <button
      key={interaction.id}
      type="button"
      onClick={() => onAction(interaction)}
      title={t(
        interaction.action === "back"
          ? "editor.prototype.runner.back"
          : "editor.prototype.runner.go",
      )}
      aria-label={t("editor.prototype.runner.hotspot")}
      className="absolute cursor-pointer rounded-lg bg-transparent transition-colors hover:bg-white/10 hover:ring-1 hover:ring-[#a7ffd4]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7ffd4]"
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
      }}
    />
  ));
}

Hotspots.propTypes = {
  doc: PropTypes.object.isRequired,
  frameId: PropTypes.string.isRequired,
  onAction: PropTypes.func.isRequired,
};

export default function PrototypeRunner({ doc, engine, startFrameId, onClose }) {
  const { t } = useI18n();
  const frames = useMemo(() => prototypeFrames(doc), [doc]);
  const initial =
    (startFrameId && frames.some((frame) => frame.id === startFrameId)
      ? startFrameId
      : null) ??
    doc?.prototype?.startFrameId ??
    frames[0]?.id ??
    null;
  const [currentId, setCurrentId] = useState(initial);
  const [history, setHistory] = useState([]);
  const [overlays, setOverlays] = useState([]);
  const [transition, setTransition] = useState(null);
  const [transitionKey, setTransitionKey] = useState(0);
  const [entering, setEntering] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: globalThis.window?.innerWidth ?? 1280,
    height: globalThis.window?.innerHeight ?? 800,
  }));
  const rafRef = useRef(0);

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener?.("resize", onResize);
    return () => window.removeEventListener?.("resize", onResize);
  }, []);

  const frame = frames.find((entry) => entry.id === currentId) ?? null;
  const images = useMemo(() => {
    const map = new Map();
    for (const id of [currentId, ...overlays.map((overlay) => overlay.frameId)]) {
      if (id && !map.has(id)) map.set(id, frameImage(engine, doc, id));
    }
    return map;
  }, [currentId, doc, engine, overlays]);

  const goBack = useCallback(() => {
    setHistory((stack) => {
      if (stack.length === 0) return stack;
      const next = [...stack];
      setCurrentId(next.pop());
      setTransition({ transition: "instant", duration: 0, easing: "ease-out" });
      setTransitionKey((key) => key + 1);
      return next;
    });
  }, []);

  const act = useCallback(
    (interaction) => {
      if (interaction.action === "back") {
        goBack();
        return;
      }
      if (interaction.action === "closeOverlay") {
        setOverlays((stack) => stack.slice(0, -1));
        return;
      }
      if (!interaction.targetId) return;
      if (interaction.action === "overlay") {
        setOverlays((stack) => [...stack, { frameId: interaction.targetId }]);
        return;
      }
      setHistory((stack) => [...stack, currentId]);
      setTransition({
        transition: interaction.transition ?? "instant",
        duration: interaction.duration ?? 300,
        easing: interaction.easing ?? "ease-out",
      });
      setCurrentId(interaction.targetId);
      setTransitionKey((key) => key + 1);
    },
    [currentId, goBack],
  );

  // Play the transition for the incoming page (enter from opacity/offset).
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!transition || transition.transition === "instant") {
      setEntering(false);
      return undefined;
    }
    setEntering(true);
    rafRef.current = requestAnimationFrame(() => setEntering(false));
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [transition, transitionKey]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (overlays.length) setOverlays((stack) => stack.slice(0, -1));
        else onClose?.();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [goBack, onClose, overlays.length]);

  if (!frame) return null;

  const maxWidth = Math.max(320, viewport.width * 0.9);
  const maxHeight = Math.max(240, viewport.height * 0.78);
  const scale = Math.min(
    maxWidth / Math.max(1, frame.width),
    maxHeight / Math.max(1, frame.height),
    1,
  );
  const displayWidth = Math.round(frame.width * scale);
  const displayHeight = Math.round(frame.height * scale);
  const duration = transition?.duration ?? 0;
  const pageStyle =
    transition && transition.transition !== "instant"
      ? {
          opacity: entering ? 0 : 1,
          transform: entering ? enterTransform(transition.transition) : "none",
          transition: entering
            ? "none"
            : `opacity ${duration}ms ${transition.easing}, transform ${duration}ms ${transition.easing}`,
        }
      : undefined;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 text-neutral-200">
        <div className={BAR_CLASS}>
          <span className="text-[11px] font-mono uppercase tracking-wide text-neutral-400">
            {t("editor.prototype.runner.title")}
          </span>
          <span className="text-[11px] font-mono text-neutral-100">
            {frame.name || t("editor.prototype.runner.frame")}
          </span>
          {overlays.length ? (
            <span className="text-[10px] font-mono text-neutral-400">
              +{overlays.length} overlay
            </span>
          ) : null}
          {history.length ? (
            <button
              type="button"
              onClick={goBack}
              className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-mono text-neutral-300 hover:bg-white/10"
            >
              <IconChevronLeft size={12} />
              {t("editor.prototype.runner.back")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setHistory([]);
              setOverlays([]);
              setCurrentId(initial);
            }}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-mono text-neutral-300 hover:bg-white/10"
          >
            <IconRefresh size={12} />
            {t("editor.prototype.runner.restart")}
          </button>
        </div>
        <button
          type="button"
          aria-label={t("editor.prototype.runner.close")}
          onClick={onClose}
          className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10 hover:text-white"
        >
          <IconClose size={14} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <div
          className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-white/15"
          style={{ width: displayWidth, height: displayHeight }}
        >
          {images.get(currentId) ? (
            <img
              key={`${currentId}-${transitionKey}`}
              src={images.get(currentId)}
              alt={frame.name || ""}
              className="h-full w-full select-none object-contain"
              draggable={false}
              style={pageStyle}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-[11px] font-mono text-neutral-400">
              {t("editor.prototype.runner.empty")}
            </div>
          )}
          <Hotspots doc={doc} frameId={currentId} onAction={act} />
        </div>

        {overlays.map((overlay, index) => {
          const overlayFrame = frames.find((entry) => entry.id === overlay.frameId);
          if (!overlayFrame) return null;
          const overlayWidth = Math.round(displayWidth * OVERLAY_WIDTH);
          const overlayHeight = Math.round(
            (overlayFrame.height / Math.max(1, overlayFrame.width)) * overlayWidth,
          );
          return (
            <div
              key={`${overlay.frameId}-${index}`}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/40"
              onClick={() => setOverlays((stack) => stack.slice(0, -1))}
            >
              <div
                role="dialog"
                aria-label={overlayFrame.name || t("editor.prototype.action.overlay")}
                className="relative shrink-0 overflow-hidden rounded-lg ring-1 ring-white/20"
                style={{ width: overlayWidth, height: overlayHeight }}
                onClick={(event) => event.stopPropagation()}
              >
                {images.get(overlay.frameId) ? (
                  <img
                    src={images.get(overlay.frameId)}
                    alt={overlayFrame.name || ""}
                    className="h-full w-full select-none object-contain"
                    draggable={false}
                  />
                ) : null}
                <Hotspots doc={doc} frameId={overlay.frameId} onAction={act} />
                <button
                  type="button"
                  aria-label={t("editor.prototype.action.closeOverlay")}
                  onClick={() => setOverlays((stack) => stack.slice(0, -1))}
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-lg bg-black/40 text-neutral-200 hover:bg-black/70"
                >
                  <IconClose size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center border-t border-white/10 py-2 text-[10px] font-mono text-neutral-500">
        {t("editor.prototype.runner.hint")}
      </div>
    </div>,
    document.body,
  );
}

PrototypeRunner.propTypes = {
  doc: PropTypes.object.isRequired,
  engine: PropTypes.object,
  startFrameId: PropTypes.string,
  onClose: PropTypes.func,
};
