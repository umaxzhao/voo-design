import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import {
  createVideoFilmstripService,
  VIDEO_THUMBNAIL_WIDTH,
} from "../../editor/video-filmstrip.js";
import { videoFilmstripTimes } from "./motion-timeline-model.js";

const MAX_THUMBNAILS = 12;
const filmstripService = createVideoFilmstripService();

export async function resolveVideoFilmstripSource(node, resolveSrc) {
  if (node.src) return node.src;
  return (await resolveSrc?.(node)) ?? null;
}

export default function VideoFilmstrip({
  node,
  resolveSrc,
  clipStart,
  clipEnd,
  timingStart,
  inPoint,
  speed,
  t,
}) {
  const elementRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [frames, setFrames] = useState([]);
  const [error, setError] = useState(false);
  const [src, setSrc] = useState(node.src ?? null);
  const count = width
    ? Math.min(
        MAX_THUMBNAILS,
        Math.max(1, Math.ceil(width / VIDEO_THUMBNAIL_WIDTH)),
      )
    : 0;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    if (!observer) window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setSrc(node.src ?? null);
    setError(false);
    void resolveVideoFilmstripSource(node, resolveSrc)
      .then((resolved) => {
        if (!active) return;
        setSrc(resolved);
        if (!resolved) setError(true);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [node, resolveSrc]);

  useEffect(() => {
    setFrames([]);
    if (!src || !count) return undefined;
    setError(false);
    const controller = new AbortController();
    const times = videoFilmstripTimes(
      { media: { inPoint, speed }, timing: { start: timingStart } },
      { start: clipStart, end: clipEnd },
      count,
    );
    void filmstripService
      .sample(src, times, { signal: controller.signal })
      .then((urls) => {
        if (!controller.signal.aborted)
          setFrames(times.map((time, index) => ({ time, url: urls[index] })));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [src, clipStart, clipEnd, timingStart, inPoint, speed, count]);

  return (
    <div
      ref={elementRef}
      data-testid="motion-video-filmstrip"
      className="pointer-events-none flex h-full w-full items-center overflow-hidden bg-neutral-800"
      aria-busy={Boolean(src) && !frames.length && !error}
    >
      {frames.length ? (
        frames.map((frame) => (
          <img
            key={frame.time}
            src={frame.url}
            alt=""
            aria-hidden="true"
            className="h-full min-w-0 flex-1 object-cover"
          />
        ))
      ) : (
        <span className="truncate px-2 text-[10px] text-neutral-400">
          {t(error ? "editor.motion.previewUnavailable" : "editor.media.video")}
        </span>
      )}
    </div>
  );
}

VideoFilmstrip.propTypes = {
  node: PropTypes.object.isRequired,
  resolveSrc: PropTypes.func,
  clipStart: PropTypes.number.isRequired,
  clipEnd: PropTypes.number.isRequired,
  timingStart: PropTypes.number.isRequired,
  inPoint: PropTypes.number.isRequired,
  speed: PropTypes.number.isRequired,
  t: PropTypes.func.isRequired,
};
