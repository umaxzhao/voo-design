import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { IconChevronRight, IconDiamond } from "../../icons.jsx";
import { hostTimesForSourceFrame } from "../../editor/instance-motion-time.js";
import {
  layerKeyframeTimes,
  motionRowKey,
  motionRowLabel,
  motionRows,
  pointerMotionTime,
  snapMotionTime,
  videoClipRange,
} from "./motion-timeline-model.js";
import { keyframeAtTime } from "../../editor/scene-motion.js";
import { clipSpan } from "./motion-clip-edit.js";
import MotionClipBar from "./motion-clip-bar.jsx";
import MotionRuler from "./motion-ruler.jsx";
import VideoFilmstrip from "./video-filmstrip.jsx";

const ROW_CLASS =
  "grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[10rem_minmax(0,1fr)]";
// Labels stay put while a zoomed lane scrolls under them.
const LABEL_CLASS = "sticky left-0 z-10";
/** True when a stored keyframe sits under the playhead for this property. */
const hasFrameAtPlayhead = (node, property, time, fps) =>
  Boolean(keyframeAtTime(node, property, time, fps));
const percent = (time, duration) =>
  `${Math.max(0, Math.min(100, (time / duration) * 100))}%`;

export default function MotionTrackArea({
  doc,
  time,
  duration,
  fps,
  selected,
  selectedNode,
  selectedInstanceChild = null,
  sourceEditable = true,
  onSelect,
  onSeek,
  onMove,
  onSelectNode,
  onClipEdit = null,
  onToggleTrack = null,
  /** Resolves a media node's playable URL; node.src dies with the session. */
  getMediaSrc = null,
  getMediaMetadata,
  expandedRows = null,
  zoom = 1,
  t,
}) {
  const [drag, setDrag] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [expandedInstances, setExpandedInstances] = useState(() => new Set());
  const toggleCollapsed = (key) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleInstance = (key) =>
    setExpandedInstances((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const dragRef = useRef(null);
  const rows = (expandedRows ?? motionRows(doc, selectedNode?.id)).map(
    (row) => ({
      ...row,
      clip:
        row.scope === "source"
          ? null
          : videoClipRange(
              row.node,
              duration,
              getMediaMetadata?.(row.node.id)?.duration,
            ),
    }),
  );
  const visibleRows = rows.filter((row) => {
    if (!row.parentIdentity) return true;
    const parentKey = JSON.stringify([
      row.parentIdentity.instanceId,
      row.parentIdentity.sourceCanvasId,
    ]);
    return expandedInstances.has(parentKey);
  });
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
    <div
      className="ui-scroll min-h-0 flex-1 overflow-auto"
      data-testid="motion-tracks"
    >
      {/* min-h-full: with few lanes the content is shorter than the panel, and
          the playhead line must still run to the panel's bottom edge. */}
      <div
        className="relative min-h-full min-w-full"
        style={{ width: `${zoom * 100}%` }}
      >
        {/* One playhead line through every lane, like a video editor. */}
        <div
          aria-hidden
          className={`${ROW_CLASS} pointer-events-none absolute inset-y-0 left-0 right-0 z-20`}
        >
          <span />
          <div className="relative px-4">
            <span
              data-testid="motion-playhead-line"
              className="absolute inset-y-0 w-px bg-[#E5B2FF]/70"
              style={{
                left: `calc(1rem + (100% - 2rem) * ${Math.max(0, Math.min(1, time / duration))})`,
              }}
            />
          </div>
        </div>
        <MotionRuler
          time={time}
          duration={duration}
          fps={fps}
          onSeek={onSeek}
          t={t}
        />
        {visibleRows.map((row) => {
          const { node, tracks, clip } = row;
          const source = row.scope === "source";
          const rowKey = motionRowKey(row);
          const rowLabel = motionRowLabel(node, t);
          const instanceKey = JSON.stringify([node.id, node.sourceCanvasId]);
          const hasNestedRows =
            row.instanceSummary &&
            rows.some(
              (candidate) =>
                candidate.parentIdentity?.instanceId === node.id &&
                candidate.parentIdentity?.sourceCanvasId ===
                  node.sourceCanvasId,
            );
          const instanceExpanded = expandedInstances.has(instanceKey);
          const isCollapsed = hasNestedRows
            ? !instanceExpanded
            : collapsed.has(rowKey);
          const span = clipSpan(
            node,
            duration,
            getMediaMetadata?.(node.id)?.duration,
          );
          const selectedRow = source
            ? selectedInstanceChild?.instanceId === row.instanceId &&
              selectedInstanceChild?.nodeId === node.id
            : selectedNode?.id === node.id ||
              (row.instanceSummary &&
                selectedInstanceChild?.instanceId === node.id &&
                selectedInstanceChild?.sourceCanvasId === node.sourceCanvasId);
          return (
            <div
              key={rowKey}
              data-testid={source ? "motion-instance-source-row" : undefined}
              data-instance-id={row.instanceId}
              data-node-id={node.id}
            >
              <div
                className={`${ROW_CLASS} ${selectedRow ? "bg-white/[0.06]" : "bg-white/[0.02]"}`}
              >
                <div
                  className={`${LABEL_CLASS} flex min-w-0 items-center ${selectedRow ? "bg-neutral-800" : "bg-neutral-900"}`}
                >
                  {tracks.length ||
                  (node.kind === "video" && !source) ||
                  hasNestedRows ? (
                    <button
                      type="button"
                      data-testid="motion-row-toggle"
                      aria-expanded={
                        hasNestedRows ? instanceExpanded : !isCollapsed
                      }
                      aria-label={t(
                        isCollapsed
                          ? "editor.motion.expandLayer"
                          : "editor.motion.collapseLayer",
                      )}
                      className={`flex h-7 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-100 ${source ? "w-9 pl-4" : "w-6"}`}
                      onClick={() =>
                        hasNestedRows
                          ? toggleInstance(instanceKey)
                          : toggleCollapsed(rowKey)
                      }
                    >
                      <IconChevronRight
                        size={12}
                        strokeWidth={1.5}
                        className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                      />
                    </button>
                  ) : (
                    <span className={source ? "w-9" : "w-6"} />
                  )}
                  <button
                    type="button"
                    disabled={source && !sourceEditable}
                    className="h-7 min-w-0 flex-1 truncate pr-3 text-left text-[11px] text-neutral-200 hover:text-white disabled:opacity-40"
                    onClick={() => onSelectNode(node.id, row)}
                    title={rowLabel}
                  >
                    {rowLabel}
                  </button>
                </div>
                <div className="px-4">
                  <MotionClipBar
                    node={node}
                    range={span}
                    limit={span.limit}
                    duration={duration}
                    fps={fps}
                    selected={selectedRow}
                    disabled={source || !onClipEdit}
                    keyframeTimes={layerKeyframeTimes(node)}
                    onSelect={() => onSelectNode(node.id, row)}
                    onSeek={onSeek}
                    onEdit={onClipEdit ?? (() => {})}
                    resolveSrc={getMediaSrc}
                    t={t}
                  />
                </div>
              </div>
              {row.instanceSummary ? (
                <div
                  className={ROW_CLASS}
                  data-testid="motion-instance-summary-track"
                  data-instance-id={node.id}
                >
                  <span
                    className={`${LABEL_CLASS} flex h-7 min-w-0 items-center truncate bg-neutral-900 pl-9 pr-2 text-[10px] text-neutral-400`}
                  >
                    {t("editor.motion.animations")}
                  </span>
                  <div className="px-4">
                    <div className="relative h-7">
                      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/[0.06]" />
                      {(row.summaryTimes ?? []).map((summaryTime) => (
                        <span
                          key={summaryTime}
                          aria-hidden="true"
                          className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E5B2FF]"
                          style={{ left: percent(summaryTime, duration) }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {node.kind === "video" && !source && !isCollapsed ? (
                <div className={ROW_CLASS}>
                  <span
                    className={`${LABEL_CLASS} flex h-9 min-w-0 items-center truncate bg-neutral-900 pl-9 pr-2 text-[10px] text-neutral-400`}
                  >
                    {t("editor.media.video")}
                  </span>
                  <div className="px-4">
                    <div
                      data-testid="motion-video-track"
                      tabIndex={-1}
                      className="relative h-9 touch-none outline-none"
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        onSelectNode(node.id, row);
                        beginScrub(event);
                      }}
                      onPointerMove={scrubMove}
                      onPointerUp={endScrub}
                      onPointerCancel={endScrub}
                    >
                      {clip ? (
                        <div
                          data-testid="motion-video-clip"
                          data-node-id={node.id}
                          className="pointer-events-none absolute inset-y-0 overflow-hidden rounded-md"
                          style={{
                            left: percent(clip.start, duration),
                            width: percent(clip.end - clip.start, duration),
                          }}
                        >
                          <VideoFilmstrip
                            node={node}
                            resolveSrc={getMediaSrc}
                            clipStart={clip.start}
                            clipEnd={clip.end}
                            timingStart={node.timing?.start ?? 0}
                            inPoint={node.media?.inPoint ?? 0}
                            speed={node.media?.speed ?? 1}
                            t={t}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
              {(isCollapsed ? [] : tracks).map((track) => (
                <div key={track.property} className={ROW_CLASS}>
                  <div
                    className={`${LABEL_CLASS} flex h-8 min-w-0 items-center bg-neutral-900 pl-9 pr-1 text-[10px] text-neutral-400`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {t(track.label)}
                    </span>
                    {onToggleTrack && !source ? (
                      <button
                        type="button"
                        data-testid="motion-row-keyframe"
                        data-property={track.property}
                        aria-label={t(
                          hasFrameAtPlayhead(node, track.property, time, fps)
                            ? "editor.motion.removeKeyframe"
                            : "editor.motion.addKeyframe",
                        )}
                        title={t(
                          hasFrameAtPlayhead(node, track.property, time, fps)
                            ? "editor.motion.removeKeyframe"
                            : "editor.motion.addKeyframe",
                        )}
                        aria-pressed={hasFrameAtPlayhead(
                          node,
                          track.property,
                          time,
                          fps,
                        )}
                        onClick={() => onToggleTrack(node.id, track.property)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[#E5B2FF] transition-colors hover:bg-white/[0.06]"
                      >
                        <IconDiamond
                          size={11}
                          strokeWidth={1.5}
                          fill={
                            hasFrameAtPlayhead(node, track.property, time, fps)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    ) : null}
                  </div>
                  <div className="px-4">
                    <div
                      tabIndex={-1}
                      className="relative h-8 touch-none outline-none"
                      onPointerDown={beginScrub}
                      onPointerMove={scrubMove}
                      onPointerUp={endScrub}
                      onPointerCancel={endScrub}
                    >
                      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/[0.06]" />
                      {track.keyframes.flatMap((frame) => {
                        const hostTimes = source
                          ? hostTimesForSourceFrame(
                              frame.time,
                              duration,
                              row.sourceDuration,
                              row.playbackStart,
                            )
                          : [frame.time];
                        return hostTimes.map((hostTime) => {
                          const identity = {
                            nodeId: node.id,
                            property: track.property,
                            time: frame.time,
                            ...(source
                              ? {
                                  instanceId: row.instanceId,
                                  sourceCanvasId: row.sourceCanvasId,
                                  hostTime,
                                }
                              : {}),
                          };
                          const active =
                            selected?.nodeId === node.id &&
                            selected?.property === track.property &&
                            selected?.time === frame.time &&
                            selected?.instanceId === identity.instanceId;
                          const dragging =
                            drag?.nodeId === node.id &&
                            drag?.property === track.property &&
                            drag?.time === frame.time &&
                            drag?.hostTime === hostTime;
                          const position = dragging ? drag.nextTime : hostTime;
                          const label = t("editor.motion.frameLabel", {
                            property: t(track.label),
                            time: position.toFixed(2),
                          });
                          return (
                            <button
                              key={`${frame.time}:${hostTime}`}
                              type="button"
                              disabled={source && !sourceEditable}
                              data-testid="motion-track-keyframe"
                              data-node-id={node.id}
                              data-property={track.property}
                              data-time={frame.time}
                              data-host-time={hostTime}
                              data-instance-id={row.instanceId}
                              aria-label={label}
                              title={label}
                              aria-pressed={active}
                              className={`absolute top-0 flex h-8 w-6 -translate-x-1/2 touch-none items-center justify-center rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-40 ${active ? "text-[#E5B2FF]" : "text-neutral-400 hover:text-neutral-100"}`}
                              style={{ left: percent(position, duration) }}
                              onPointerDown={(event) => {
                                if (source && !sourceEditable) return;
                                if (event.button !== 0) return;
                                event.stopPropagation();
                                event.preventDefault();
                                event.currentTarget.focus();
                                onSelect(identity);
                                onSeek(hostTime);
                                const state = {
                                  ...identity,
                                  hostTime,
                                  nextTime: hostTime,
                                  startX: event.clientX,
                                  rect: event.currentTarget.parentElement.getBoundingClientRect(),
                                };
                                dragRef.current = state;
                                setDrag(state);
                                event.currentTarget.setPointerCapture(
                                  event.pointerId,
                                );
                              }}
                              onPointerMove={(event) => {
                                event.stopPropagation();
                                const current = dragRef.current;
                                if (
                                  !current ||
                                  !event.currentTarget.hasPointerCapture(
                                    event.pointerId,
                                  )
                                )
                                  return;
                                const nextTime = snapMotionTime(
                                  current.hostTime +
                                    ((event.clientX - current.startX) /
                                      current.rect.width) *
                                      duration,
                                  duration,
                                  fps,
                                );
                                if (nextTime === current.nextTime) return;
                                dragRef.current = { ...current, nextTime };
                                setDrag(dragRef.current);
                              }}
                              onPointerUp={(event) => {
                                event.stopPropagation();
                                const current = dragRef.current;
                                dragRef.current = null;
                                setDrag(null);
                                if (
                                  event.currentTarget.hasPointerCapture(
                                    event.pointerId,
                                  )
                                )
                                  event.currentTarget.releasePointerCapture(
                                    event.pointerId,
                                  );
                                if (
                                  current &&
                                  current.nextTime !== current.hostTime
                                )
                                  onMove(identity, current.nextTime);
                              }}
                              onPointerCancel={() => {
                                dragRef.current = null;
                                setDrag(null);
                              }}
                              onLostPointerCapture={() => {
                                dragRef.current = null;
                                setDrag(null);
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (event.detail === 0) {
                                  onSelect(identity);
                                  onSeek(hostTime);
                                }
                              }}
                              onDoubleClick={() => {
                                onSelect(identity);
                                onSeek(hostTime);
                              }}
                            >
                              <IconDiamond
                                size={12}
                                strokeWidth={1.5}
                                fill="currentColor"
                              />
                            </button>
                          );
                        });
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {!visibleRows.length ? (
          <p className="px-3 py-4 text-[11px] text-neutral-500">
            {t("editor.motion.noTracks")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

MotionTrackArea.propTypes = {
  doc: PropTypes.object,
  time: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
  fps: PropTypes.number.isRequired,
  selected: PropTypes.object,
  selectedNode: PropTypes.object,
  selectedInstanceChild: PropTypes.object,
  sourceEditable: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
  onSeek: PropTypes.func.isRequired,
  onMove: PropTypes.func.isRequired,
  onSelectNode: PropTypes.func.isRequired,
  onClipEdit: PropTypes.func,
  onToggleTrack: PropTypes.func,
  zoom: PropTypes.number,
  getMediaMetadata: PropTypes.func,
  getMediaSrc: PropTypes.func,
  expandedRows: PropTypes.array,
  t: PropTypes.func.isRequired,
};
