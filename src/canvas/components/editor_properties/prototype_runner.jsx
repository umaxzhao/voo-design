/**
 * Prototype runner (MVP): plays frame-to-frame interactions in a fullscreen
 * overlay. Frames are rasterised through the existing export pipeline, so the
 * preview is exactly what Present/Export would show; interactions become
 * clickable hotspots on top, positioned in frame-relative percentages.
 */

import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [viewport, setViewport] = useState(() => ({
    width: globalThis.window?.innerWidth ?? 1280,
    height: globalThis.window?.innerHeight ?? 800,
  }));

  useEffect(() => {
    const onResize = () =>
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    window.addEventListener?.("resize", onResize);
    return () => window.removeEventListener?.("resize", onResize);
  }, []);

  const frame = frames.find((entry) => entry.id === currentId) ?? null;

  const image = useMemo(() => {
    if (!frame || !engine?.exportSelectionPng) return null;
    const ids = frameSubtreeIds(doc, frame.id);
    const result = engine.exportSelectionPng(ids, {
      scale: 1,
      transparent: false,
    });
    return typeof result === "string" ? result : result?.dataUrl ?? null;
  }, [doc, engine, frame]);

  const interactions = useMemo(
    () => (frame ? interactionsInFrame(doc, frame.id) : []),
    [doc, frame],
  );

  const goBack = useCallback(() => {
    setHistory((stack) => {
      if (stack.length === 0) return stack;
      const next = [...stack];
      setCurrentId(next.pop());
      return next;
    });
  }, []);

  const navigate = useCallback(
    (interaction) => {
      if (interaction.action === "back") {
        goBack();
        return;
      }
      if (!interaction.targetId) return;
      setHistory((stack) => [...stack, currentId]);
      setCurrentId(interaction.targetId);
    },
    [currentId, goBack],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [goBack, onClose]);

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

  const hotspots = interactions
    .map((interaction) => ({
      interaction,
      rect: hotspotRect(doc, interaction),
    }))
    .filter((entry) => entry.rect && entry.rect.width > 0 && entry.rect.height > 0);
  // Frame-level hotspots sit below layer hotspots so a child can win the click.
  hotspots.sort((a, b) => {
    const aFrame = a.interaction.sourceId === frame.id ? 1 : 0;
    const bFrame = b.interaction.sourceId === frame.id ? 1 : 0;
    return aFrame - bFrame;
  });

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
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <div
          className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-white/15"
          style={{ width: displayWidth, height: displayHeight }}
        >
          {image ? (
            <img
              src={image}
              alt={frame.name || ""}
              className="h-full w-full select-none object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-[11px] font-mono text-neutral-400">
              {t("editor.prototype.runner.empty")}
            </div>
          )}
          {hotspots.map(({ interaction, rect }) => (
            <button
              key={interaction.id}
              type="button"
              onClick={() => navigate(interaction)}
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
          ))}
        </div>
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
