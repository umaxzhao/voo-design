import PropTypes from "prop-types";
import { useEffect, useRef } from "react";
import {
  formatTimecode,
  motionRulerTicks,
  pointerMotionTime,
  snapMotionTime,
} from "./motion-timeline-model.js";

const ROW_CLASS =
  "grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[10rem_minmax(0,1fr)]";
const percent = (time, duration) => `${(time / duration) * 100}%`;

export default function MotionRuler({ time, duration, fps, onSeek, t }) {
  const scrubRafRef = useRef(null);
  const pendingSeekTimeRef = useRef(null);

  useEffect(() => {
    return () => {
      if (scrubRafRef.current !== null) {
        cancelAnimationFrame(scrubRafRef.current);
      }
    };
  }, []);

  const seekPointerDirect = (event) =>
    onSeek(
      pointerMotionTime(
        event.clientX,
        event.currentTarget.getBoundingClientRect(),
        duration,
        fps,
      ),
    );

  const seekPointerThrottled = (event) => {
    const target = pointerMotionTime(
      event.clientX,
      event.currentTarget.getBoundingClientRect(),
      duration,
      fps,
    );
    pendingSeekTimeRef.current = target;
    if (scrubRafRef.current !== null) return;
    scrubRafRef.current = requestAnimationFrame(() => {
      scrubRafRef.current = null;
      if (pendingSeekTimeRef.current !== null) {
        onSeek(pendingSeekTimeRef.current);
        pendingSeekTimeRef.current = null;
      }
    });
  };

  const beginScrub = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    seekPointerDirect(event);
  };
  const scrubMove = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      seekPointerThrottled(event);
  };
  const endScrub = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (scrubRafRef.current !== null) {
      cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = null;
    }
    if (pendingSeekTimeRef.current !== null) {
      onSeek(pendingSeekTimeRef.current);
      pendingSeekTimeRef.current = null;
    }
  };
  return (
    <div className={`${ROW_CLASS} sticky top-0 z-30 bg-neutral-900`}>
      <span className="sticky left-0 z-30 flex h-8 items-center bg-neutral-900 px-3 text-[10px] text-neutral-500">
        {t("editor.motion.layers")}
      </span>
      <div className="px-4">
        <div
          role="slider"
          tabIndex={0}
          aria-label={t("editor.motion.time")}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={time}
          aria-valuetext={formatTimecode(time, fps)}
          data-testid="motion-ruler"
          className="relative h-8 cursor-ew-resize touch-none outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          onPointerDown={beginScrub}
          onPointerMove={scrubMove}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            event.stopPropagation();
            onSeek(
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? duration
                  : snapMotionTime(
                      time + (event.key === "ArrowLeft" ? -1 : 1) / fps,
                      duration,
                      fps,
                    ),
            );
          }}
        >
          {motionRulerTicks(duration).map((tick) => (
            <span
              key={tick}
              className="pointer-events-none absolute bottom-0 top-1 flex flex-col justify-between text-[9px] tabular-nums text-neutral-500"
              style={{ left: percent(tick, duration) }}
            >
              <span>
                {tick}
                {t("editor.motion.seconds")}
              </span>
              <span className="h-1 w-px bg-white/20" />
            </span>
          ))}
          <span
            data-testid="motion-playhead"
            className="pointer-events-none absolute inset-y-0 w-px bg-[#E5B2FF]"
            style={{ left: percent(time, duration) }}
          >
            <span className="absolute -left-1 top-0 h-2 w-2 rounded-md bg-[#E5B2FF]" />
          </span>
        </div>
      </div>
    </div>
  );
}

MotionRuler.propTypes = {
  time: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
  fps: PropTypes.number.isRequired,
  onSeek: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
