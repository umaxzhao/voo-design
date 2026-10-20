import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { IconDiamond } from "../../icons.jsx";
import { dragClipTiming } from "./motion-timeline-model.js";
import { loadWaveform, waveformBars } from "./audio-waveform.js";

const percent = (time, duration) =>
  `${Math.max(0, Math.min(100, (time / duration) * 100))}%`;

/**
 * One layer's span on the timeline, video-editor style: a bar you drag to
 * move and pull by either end to trim, with the layer's keyframes summarised
 * on it. Layers without `timing` fill the composition.
 */
export default function MotionClipBar({
  node,
  range: span,
  limit = null,
  duration,
  fps,
  selected,
  disabled = false,
  keyframeTimes,
  onSelect,
  onSeek,
  onEdit,
  /** Resolves an audio node's playable URL (node.src dies with the session). */
  resolveSrc = null,
  t,
}) {
  const barRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);
  // Sound draws its own shape; decode once per source and keep the peaks.
  const [peaks, setPeaks] = useState(null);
  const [soundSrc, setSoundSrc] = useState(node.src ?? null);
  const sourceNodeRef = useRef(node);
  sourceNodeRef.current = node;
  useEffect(() => {
    setSoundSrc(node.src ?? null);
    if (node.kind !== "audio") return undefined;
    let alive = true;
    // A node reloaded from storage has only its assetId; the engine mints
    // the blob URL back (getMediaSrc) when the caller can resolve it.
    if (!node.src) {
      // Asset replacement keeps the layer id; resolve it again without doing
      // another lookup for every timing/keyframe update during playback.
      void Promise.resolve(resolveSrc?.(sourceNodeRef.current) ?? null).then(
        (resolved) => {
          if (alive) setSoundSrc(resolved ?? null);
        },
      );
      return () => {
        alive = false;
      };
    }
    return () => {
      alive = false;
    };
  }, [node.kind, node.id, node.src, node.assetId, resolveSrc]);
  useEffect(() => {
    let alive = true;
    if (!soundSrc) {
      setPeaks(null);
      return () => {
        alive = false;
      };
    }
    void loadWaveform(soundSrc).then((value) => {
      if (alive) setPeaks(value);
    });
    return () => {
      alive = false;
    };
  }, [soundSrc]);
  const bars = peaks?.length ? waveformBars(peaks, 100, 24) : [];
  const range = drag ? drag.next : span;
  const label = node.name || t("editor.motion.unnamedObject");

  const begin = (edge) => (event) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    const rect = barRef.current.parentElement.getBoundingClientRect();
    const origin = span;
    dragRef.current = {
      edge,
      startX: event.clientX,
      width: rect.width,
      origin,
      next: origin,
    };
    setDrag(dragRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event) => {
    const current = dragRef.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId))
      return;
    const delta = ((event.clientX - current.startX) / current.width) * duration;
    const dragged = dragClipTiming(
      current.origin,
      current.edge,
      delta,
      duration,
      fps,
    );
    // The tail of a clip with footage cannot run past the footage.
    const next =
      limit !== null && current.edge === "end"
        ? { ...dragged, end: Math.min(dragged.end, limit) }
        : dragged;
    dragRef.current = { ...current, next };
    setDrag(dragRef.current);
  };
  const finish = (event) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (
      !current ||
      (current.next.start === current.origin.start &&
        current.next.end === current.origin.end)
    )
      return;
    onEdit(node.id, current.edge, current.next);
  };

  /** Keyboard nudge: one frame at a time shares the drag's patch rules. */
  const nudge = (edge, frames) => {
    if (disabled || !frames) return;
    const dragged = dragClipTiming(span, edge, frames / fps, duration, fps);
    const next =
      edge === "end" && limit !== null
        ? { ...dragged, end: Math.min(dragged.end, limit) }
        : dragged;
    if (next.start === span.start && next.end === span.end) return;
    onSelect();
    onEdit(node.id, edge, next);
  };
  const keyDown = (event) => {
    if (disabled) return;
    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    // Arrows move the clip; Shift+arrows trim the tail; Alt+Shift the head.
    nudge(
      event.shiftKey ? (event.altKey ? "start" : "end") : "move",
      direction,
    );
  };

  return (
    <div className="relative h-7" ref={barRef}>
      <div
        data-testid="motion-clip"
        data-node-id={node.id}
        data-start={range.start}
        data-end={range.end}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-description={t("editor.motion.clipKeysHint")}
        className={`absolute inset-y-1 flex min-w-2 touch-none items-center overflow-hidden rounded-md outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4] ${
          selected
            ? "bg-[#E5B2FF]/15 text-[#eed0ff]"
            : "bg-white/[0.08] text-neutral-300"
        } ${disabled ? "opacity-40" : "cursor-grab active:cursor-grabbing"}`}
        style={{
          left: percent(range.start, duration),
          width: percent(range.end - range.start, duration),
        }}
        onPointerDown={begin("move")}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={keyDown}
        onDoubleClick={() => onSeek(range.start)}
      >
        <span
          data-testid="motion-clip-trim-start"
          role="slider"
          aria-label={t("editor.motion.trimStart")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={span.start}
          aria-orientation="horizontal"
          tabIndex={disabled ? -1 : 0}
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-white/20 hover:bg-white/40 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
          onPointerDown={begin("start")}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            nudge("start", event.key === "ArrowRight" ? 1 : -1);
          }}
        />
        {bars.length ? (
          <svg
            data-testid="motion-clip-waveform"
            aria-hidden="true"
            viewBox="0 0 100 24"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
          >
            {bars.map((bar, index) => (
              <rect
                key={index}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill="currentColor"
              />
            ))}
          </svg>
        ) : null}
        <span className="pointer-events-none relative z-10 min-w-0 flex-1 truncate px-3 text-[10px]">
          {label}
        </span>
        <span
          data-testid="motion-clip-trim-end"
          role="slider"
          aria-label={t("editor.motion.trimEnd")}
          aria-valuemin={0}
          aria-valuemax={Math.round(limit ?? duration)}
          aria-valuenow={span.end}
          aria-orientation="horizontal"
          tabIndex={disabled ? -1 : 0}
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-white/20 hover:bg-white/40 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
          onPointerDown={begin("end")}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            nudge("end", event.key === "ArrowRight" ? 1 : -1);
          }}
        />
      </div>
      {keyframeTimes.map((time) => (
        <span
          key={time}
          data-testid="motion-summary-keyframe"
          className="pointer-events-none absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[#E5B2FF]"
          style={{ left: percent(time, duration) }}
        >
          <IconDiamond size={9} strokeWidth={1.5} fill="currentColor" />
        </span>
      ))}
    </div>
  );
}

MotionClipBar.propTypes = {
  node: PropTypes.object.isRequired,
  range: PropTypes.shape({
    start: PropTypes.number.isRequired,
    end: PropTypes.number.isRequired,
  }).isRequired,
  limit: PropTypes.number,
  duration: PropTypes.number.isRequired,
  fps: PropTypes.number.isRequired,
  selected: PropTypes.bool,
  disabled: PropTypes.bool,
  keyframeTimes: PropTypes.arrayOf(PropTypes.number).isRequired,
  onSelect: PropTypes.func.isRequired,
  onSeek: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  resolveSrc: PropTypes.func,
  t: PropTypes.func.isRequired,
};
