/* eslint-disable react/prop-types */
/**
 * @file VisualDiffViewer.jsx
 * Image before/after visual comparison component for agent reviews.
 * Supports side-by-side, interactive slider, and toggle modes.
 * Complies with Design.md (flat, no emoji, stroke 1.5, >= 48px touch targets).
 */

import { useState, useRef, useCallback } from "react";
import { useI18n } from "../../../use_i18n.js";
import { IconImage, IconEye, IconSliders } from "../../../icons.jsx";

export default function VisualDiffViewer({
  beforeImage = null,
  afterImage = null,
  action = "modified",
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState("split"); // 'split' | 'slider' | 'toggle'
  const [sliderPos, setSliderPos] = useState(50); // percentage 0-100
  const [toggleActive, setToggleActive] = useState("after"); // 'before' | 'after'
  const [beforeLoadError, setBeforeLoadError] = useState(false);
  const [afterLoadError, setAfterLoadError] = useState(false);

  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Update slider position based on pointer event coordinates
  const updateSliderFromClientX = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clampedX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const nextPercent = Math.round((clampedX / rect.width) * 100);
    setSliderPos(nextPercent);
  }, []);

  const handlePointerDown = (e) => {
    isDraggingRef.current = true;
    updateSliderFromClientX(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    updateSliderFromClientX(e.clientX);
  };

  const handlePointerUp = (e) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if already released
    }
  };

  // Keyboard navigation for slider handle
  const handleKeyDown = (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSliderPos((prev) => Math.max(0, prev - 5));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSliderPos((prev) => Math.min(100, prev + 5));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSliderPos(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSliderPos(100);
    }
  };

  // Missing image explanation
  const getMissingReason = (isBefore) => {
    if (isBefore) {
      if (action === "created") return t("agent.review.noImageReasonCreated");
      return t("agent.review.noImageReasonMissing");
    }
    if (action === "deleted") return t("agent.review.noImageReasonDeleted");
    return t("agent.review.noImageReasonMissing");
  };

  const renderImageOrPlaceholder = (uri, isBefore, hasError) => {
    if (!uri || hasError) {
      return (
        <div className="flex h-36 w-full flex-col items-center justify-center rounded-lg bg-white/[0.02] p-3 text-center text-neutral-500">
          <IconImage size={24} className="opacity-40" />
          <span className="mt-1.5 text-[10px] text-neutral-400">
            {t("agent.review.noPreview")}
          </span>
          <span className="mt-0.5 text-[9px] text-neutral-500">
            {getMissingReason(isBefore)}
          </span>
        </div>
      );
    }

    return (
      <img
        src={uri}
        alt={isBefore ? t("agent.review.before") : t("agent.review.after")}
        draggable={false}
        onError={() =>
          isBefore ? setBeforeLoadError(true) : setAfterLoadError(true)
        }
        className="h-36 w-full object-contain rounded-lg bg-black/40"
      />
    );
  };

  const hasBothImages = Boolean(
    beforeImage && afterImage && !beforeLoadError && !afterLoadError,
  );

  return (
    <div className="space-y-2 rounded-xl bg-white/[0.02] p-2.5">
      {/* Mode Switcher toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
        <span className="text-[10px] font-medium text-neutral-400">
          {t("agent.review.cardTitle")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode("split")}
            aria-pressed={mode === "split"}
            className={`flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg px-2 text-[10px] font-medium transition-colors ${
              mode === "split"
                ? "bg-white/[0.1] text-white"
                : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
            }`}
          >
            {t("agent.review.modeSideBySide")}
          </button>

          {hasBothImages && (
            <button
              type="button"
              onClick={() => setMode("slider")}
              aria-pressed={mode === "slider"}
              className={`flex min-h-[48px] min-w-[48px] items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-medium transition-colors ${
                mode === "slider"
                  ? "bg-white/[0.1] text-white"
                  : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
              }`}
            >
              <IconSliders size={12} />
              <span>{t("agent.review.modeSlider")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMode("toggle")}
            aria-pressed={mode === "toggle"}
            className={`flex min-h-[48px] min-w-[48px] items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-medium transition-colors ${
              mode === "toggle"
                ? "bg-white/[0.1] text-white"
                : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
            }`}
          >
            <IconEye size={12} />
            <span>{t("agent.review.viewDiff")}</span>
          </button>
        </div>
      </div>

      {/* 1. Side by side mode */}
      {mode === "split" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-neutral-400">
              <span>{t("agent.review.before")}</span>
            </div>
            {renderImageOrPlaceholder(beforeImage, true, beforeLoadError)}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-emerald-400">
              <span>{t("agent.review.after")}</span>
            </div>
            {renderImageOrPlaceholder(afterImage, false, afterLoadError)}
          </div>
        </div>
      )}

      {/* 2. Interactive Slider mode */}
      {mode === "slider" && hasBothImages && (
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative h-44 w-full select-none overflow-hidden rounded-lg bg-black/50 touch-none cursor-ew-resize"
        >
          {/* After image (background layer) */}
          <img
            src={afterImage}
            alt={t("agent.review.after")}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
          />

          {/* Before image (clipped overlay layer) */}
          <div
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: `${sliderPos}%` }}
          >
            <div
              style={{
                width: containerRef.current?.clientWidth || 280,
                height: "100%",
              }}
            >
              <img
                src={beforeImage}
                alt={t("agent.review.before")}
                draggable={false}
                className="h-full w-full object-contain"
              />
            </div>
          </div>

          {/* Slider divider line and touch handle */}
          <div
            className="absolute inset-y-0 -ml-[24px] flex w-[48px] items-center justify-center pointer-events-none"
            style={{ left: `${sliderPos}%` }}
          >
            {/* Divider line */}
            <div className="absolute inset-y-0 left-[23px] w-[2px] bg-white/70 shadow-menu" />
            {/* 48px touch handle */}
            <div
              role="slider"
              tabIndex={0}
              aria-label={t("agent.review.modeSlider")}
              aria-valuenow={sliderPos}
              aria-valuemin={0}
              aria-valuemax={100}
              onKeyDown={handleKeyDown}
              className="pointer-events-auto flex h-[48px] w-[48px] items-center justify-center focus:outline-none"
            >
              <div className="h-6 w-6 rounded-full border border-white/20 bg-neutral-900 shadow-menu flex items-center justify-center text-[9px] text-white">
                <IconSliders size={12} />
              </div>
            </div>
          </div>

          {/* Labels */}
          <div className="absolute top-1.5 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] text-neutral-300 pointer-events-none">
            {t("agent.review.before")}
          </div>
          <div className="absolute top-1.5 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] text-emerald-400 pointer-events-none">
            {t("agent.review.after")}
          </div>
        </div>
      )}

      {/* 3. Toggle Mode */}
      {mode === "toggle" && (
        <div className="space-y-2">
          <div className="flex rounded-lg bg-black/40 p-1">
            <button
              type="button"
              onClick={() => setToggleActive("before")}
              className={`flex-1 min-h-[48px] rounded-md text-[11px] font-medium transition-colors ${
                toggleActive === "before"
                  ? "bg-white/[0.12] text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {t("agent.review.before")}
            </button>
            <button
              type="button"
              onClick={() => setToggleActive("after")}
              className={`flex-1 min-h-[48px] rounded-md text-[11px] font-medium transition-colors ${
                toggleActive === "after"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {t("agent.review.after")}
            </button>
          </div>

          <div>
            {toggleActive === "before"
              ? renderImageOrPlaceholder(beforeImage, true, beforeLoadError)
              : renderImageOrPlaceholder(afterImage, false, afterLoadError)}
          </div>
        </div>
      )}
    </div>
  );
}
