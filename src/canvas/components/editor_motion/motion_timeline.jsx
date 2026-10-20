import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { sourceTimeForHost } from "../../editor/instance-motion-time.js";
import {
  applyTimelinePatch,
  moveNodeKeyframe,
  normalizeTimeline,
  removeNodeKeyframe,
  upsertNodeKeyframe,
} from "../../editor/scene-motion.js";
import { useI18n } from "../../use_i18n.js";
import {
  clipSpan,
  moveClipPatch,
  splitClip,
  trimEndPatch,
  trimStartPatch,
} from "./motion-clip-edit.js";
import MotionTrackArea from "./motion-track-area.jsx";
import MotionFrameControls from "./motion-frame-controls.jsx";
import MotionPropertyControls from "./motion-property-controls.jsx";
import MotionTransportControls from "./motion-transport-controls.jsx";
import {
  selectedInstanceContext,
  syncInstanceSourceTime,
} from "./motion-instance-controller.js";
import { combinedMotionRows } from "./motion-instance-rows.js";
import {
  localSourceState,
  setLocalSourceKeyframeValue,
  sourceDocumentForIdentity,
  toggleLocalSourceKeyframe,
  updateLocalSourceTrack,
} from "./motion-instance-animation.js";
import {
  motionFieldState,
  setTimelineKeyframeValue,
  toggleTimelineKeyframe,
} from "./motion-field-actions.js";
import { propertiesForNode } from "./motion_properties.js";
import {
  clampTimelineHeight,
  clampTimelineZoom,
  TIMELINE_HEIGHT_STEP,
  TIMELINE_HEIGHT_STORAGE_KEY,
  selectedMotionFrame,
  snapMotionTime,
  timelineShortcut,
} from "./motion-timeline-model.js";

/** The remembered height is a per-viewer convenience; a missing store is fine. */
function readStoredHeight() {
  try {
    const stored = window.localStorage.getItem(TIMELINE_HEIGHT_STORAGE_KEY);
    return stored === null
      ? null
      : clampTimelineHeight(stored, window.innerHeight);
  } catch {
    return null;
  }
}

function storeHeight(height) {
  try {
    if (height === null)
      window.localStorage.removeItem(TIMELINE_HEIGHT_STORAGE_KEY);
    else
      window.localStorage.setItem(TIMELINE_HEIGHT_STORAGE_KEY, String(height));
  } catch {
    // Private windows and blocked storage just forget the height.
  }
}

export default function MotionTimeline({
  engine,
  doc,
  selectedNode,
  selectedInstanceChild = null,
  sourceEngine = null,
  sourceDoc = null,
  instanceSources = [],
  onSelectInstanceChild = null,
  onClose,
  onExport = null,
  onHeightChange = null,
  mediaError = null,
}) {
  const { t } = useI18n();
  const timelineRef = useRef(null);
  const exportControllerRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [chosenProperty, setChosenProperty] = useState("x");
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  // null keeps the compact default; a number is the height the user dragged to.
  const [height, setHeight] = useState(readStoredHeight);
  const resizeRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const playback = engine.getPlaybackState();
  const { duration, fps, time, playing } = playback;
  const source = selectedInstanceContext(doc, sourceDoc, selectedInstanceChild);
  const sourceActive = Boolean(source?.sourceNode && sourceEngine);
  const editEngine = sourceActive ? sourceEngine : engine;
  const editNode = sourceActive
    ? source.sourceNode
    : selectedInstanceChild
      ? null
      : selectedNode;
  const frameDoc = sourceDocumentForIdentity(
    doc,
    sourceDoc,
    instanceSources,
    selected,
  );
  const frame = selectedMotionFrame(frameDoc, selected);
  const propertyOptions = editNode ? propertiesForNode(editNode) : [];
  const property = propertyOptions.some(([path]) => path === chosenProperty)
    ? chosenProperty
    : propertyOptions[0]?.[0];
  const sourceTime = sourceActive
    ? sourceTimeForHost(
        time,
        normalizeTimeline(source.doc.timeline).duration,
        source.instance.instance?.playbackStart ?? 0,
      )
    : null;
  const propertyState =
    editNode && property
      ? sourceActive
        ? localSourceState(engine, source, property, time)
        : motionFieldState(editEngine, editNode.id, property, sourceTime)
      : null;
  const expandedRows = combinedMotionRows(
    doc,
    sourceDoc,
    selectedInstanceChild,
    instanceSources,
  );

  useEffect(() => () => exportControllerRef.current?.abort(), []);
  useEffect(() => {
    if (source?.instance && sourceEngine)
      syncInstanceSourceTime(engine, sourceEngine, source.instance);
  }, [engine, sourceEngine, source?.instance, time]);
  useEffect(() => {
    const element = timelineRef.current;
    if (!element || !onHeightChange) return undefined;
    const measure = () =>
      onHeightChange(element.getBoundingClientRect().height);
    measure();
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      onHeightChange(0);
    };
  }, [onHeightChange]);

  const applyHeight = (value, { persist = false } = {}) => {
    const next =
      value === null ? null : clampTimelineHeight(value, window.innerHeight);
    setHeight(next);
    if (persist) storeHeight(next);
  };
  const beginResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      startY: event.clientY,
      startHeight: timelineRef.current.getBoundingClientRect().height,
    };
  };
  const moveResize = (event) => {
    const drag = resizeRef.current;
    if (!drag) return;
    // Dragging up makes the timeline taller.
    applyHeight(drag.startHeight + (drag.startY - event.clientY));
  };
  const endResize = (event) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    storeHeight(height);
  };
  const mediaDurationOf = (nodeId) =>
    engine.getMediaPlaybackMetadata?.(nodeId)?.duration;
  const minClipLength = 1 / fps;

  /** Drag results arrive as the new span; the patch keeps a video's footage in step. */
  const editClip = (nodeId, edge, next) =>
    perform(() => {
      const node = doc.nodes.find((entry) => entry.id === nodeId);
      if (!node) return;
      const meta = mediaDurationOf(nodeId);
      const span = clipSpan(node, duration, meta);
      const patch =
        edge === "start"
          ? trimStartPatch(node, next.start, duration, meta, minClipLength)
          : edge === "end"
            ? trimEndPatch(node, next.end, duration, meta, minClipLength)
            : moveClipPatch(
                node,
                next.start - span.start,
                duration,
                meta,
                minClipLength,
              );
      engine.pause();
      // Merge here: a plain layer's patch would otherwise replace its timing.
      engine.updateNode(nodeId, {
        timing: { ...node.timing, ...patch.timing },
        ...(patch.media ? { media: { ...node.media, ...patch.media } } : {}),
        ...(patch.animations ? { animations: patch.animations } : {}),
      });
    });

  // A layer can be cut when the playhead is inside it.
  const splitSpan = selectedNode
    ? clipSpan(selectedNode, duration, mediaDurationOf(selectedNode.id))
    : null;
  const canSplit = Boolean(
    splitSpan &&
    time > splitSpan.start + minClipLength &&
    time < splitSpan.end - minClipLength,
  );
  const splitAtPlayhead = () =>
    perform(() => {
      if (!selectedNode || !canSplit)
        throw new Error(t("editor.motion.splitOutside"));
      const { first, second } = splitClip(
        selectedNode,
        time,
        duration,
        mediaDurationOf(selectedNode.id),
        minClipLength,
        crypto.randomUUID(),
      );
      engine.pause();
      engine.setDoc(
        {
          ...doc,
          nodes: doc.nodes.flatMap((node) =>
            node.id === selectedNode.id ? [first, second] : [node],
          ),
        },
        { name: t("editor.motion.split") },
      );
      engine.selectExactly([second.id]);
    });

  const perform = (action) => {
    try {
      setError(null);
      action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("editor.motion.actionFailed"),
      );
    }
  };
  const seek = (next) =>
    perform(() => {
      engine.pause();
      engine.seekToTime(next);
      if (source?.instance && sourceEngine)
        syncInstanceSourceTime(engine, sourceEngine, source.instance);
    });
  const seekByFrame = (step) =>
    seek(snapMotionTime(time + step / fps, duration, fps));
  /** Drop the selected layer, which Delete does once the timeline holds focus. */
  const removeSelectedLayer = () =>
    perform(() => {
      if (!selectedNode) return;
      engine.pause();
      engine.removeNode(selectedNode.id);
      setSelected(null);
      timelineRef.current?.focus();
    });
  const deselectLayer = () =>
    perform(() => {
      engine.selectExactly([]);
      setSelected(null);
      timelineRef.current?.focus();
    });
  const togglePlayback = () =>
    perform(() =>
      engine.getPlaybackState().playing ? engine.pause() : engine.play(),
    );
  const removeSelected = () =>
    perform(() => {
      if (!frame) return;
      if (selected?.instanceId) {
        if (source?.instance?.id !== selected.instanceId) return;
        engine.pause();
        updateLocalSourceTrack(
          engine,
          source,
          selected.property,
          engine.getPlaybackState().time,
          (node) => removeNodeKeyframe(node, selected.property, selected.time),
        );
      } else {
        engine.pause();
        engine.removeKeyframe(
          selected.nodeId,
          selected.property,
          selected.time,
        );
      }
      setSelected(null);
      timelineRef.current?.focus();
    });
  const moveFrame = (identity, nextTime) =>
    perform(() => {
      const next = snapMotionTime(nextTime, duration, fps);
      engine.pause();
      if (identity.instanceId && source?.instance?.id !== identity.instanceId)
        return;
      const targetTime = identity.instanceId
        ? sourceTimeForHost(
            next,
            normalizeTimeline(source.doc.timeline).duration,
            source.instance.instance?.playbackStart ?? 0,
          )
        : next;
      if (identity.instanceId) {
        updateLocalSourceTrack(
          engine,
          source,
          identity.property,
          time,
          (node) =>
            moveNodeKeyframe(
              node,
              identity.property,
              identity.time,
              targetTime,
            ),
        );
      } else {
        engine.moveKeyframe(
          identity.nodeId,
          identity.property,
          identity.time,
          targetTime,
        );
      }
      setSelected({ ...identity, time: targetTime, hostTime: next });
      engine.seekToTime(next);
      if (identity.instanceId && source?.instance)
        syncInstanceSourceTime(engine, sourceEngine, source.instance);
      // Retiming changes the button key, so keep keyboard ownership in the timeline.
      timelineRef.current?.focus();
    });
  const selectFrame = (identity) => {
    setSelected(identity);
    setChosenProperty(identity.property);
    perform(() => {
      if (identity.instanceId) {
        onSelectInstanceChild?.({
          instanceId: identity.instanceId,
          sourceCanvasId: identity.sourceCanvasId,
          nodeId: identity.nodeId,
        });
      } else {
        engine.selectExactly([identity.nodeId]);
        onSelectInstanceChild?.(null);
      }
    });
  };
  const toggleCurrentFrame = () =>
    perform(() => {
      if (!editNode || !property) return;
      if (sourceActive) {
        syncInstanceSourceTime(engine, sourceEngine, source.instance);
      }
      const localIdentity = sourceActive
        ? toggleLocalSourceKeyframe(engine, source, property)
        : null;
      const identity = sourceActive
        ? localIdentity && {
            nodeId: editNode.id,
            property,
            time: localIdentity.time,
          }
        : toggleTimelineKeyframe(editEngine, editNode.id, property);
      setSelected(
        identity && sourceActive
          ? {
              ...identity,
              ...selectedInstanceChild,
              hostTime: engine.getPlaybackState().time,
            }
          : identity,
      );
    });
  const setCurrentValue = (value) =>
    perform(() => {
      if (!editNode || !property) return;
      if (sourceActive) {
        syncInstanceSourceTime(engine, sourceEngine, source.instance);
      }
      const localIdentity = sourceActive
        ? setLocalSourceKeyframeValue(engine, source, property, value)
        : null;
      const identity = sourceActive
        ? localIdentity && {
            nodeId: editNode.id,
            property,
            time: localIdentity.time,
          }
        : setTimelineKeyframeValue(editEngine, editNode.id, property, value);
      setSelected(
        sourceActive
          ? {
              ...identity,
              ...selectedInstanceChild,
              hostTime: engine.getPlaybackState().time,
            }
          : identity,
      );
    });
  const exportMotion = async () => {
    if (exportControllerRef.current) return;
    const controller = new AbortController();
    exportControllerRef.current = controller;
    setExporting(true);
    setExportProgress(null);
    setError(null);
    try {
      await onExport((value) => {
        if (!controller.signal.aborted) setExportProgress(value);
      }, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : t("editor.motion.actionFailed"),
        );
    } finally {
      if (exportControllerRef.current === controller)
        exportControllerRef.current = null;
      if (!controller.signal.aborted) setExporting(false);
    }
  };

  return (
    <section
      ref={timelineRef}
      id="editor-motion-timeline"
      role="region"
      tabIndex={-1}
      aria-label={t("editor.motion.title")}
      data-testid="editor-motion-timeline"
      style={height ? { height, maxHeight: "60vh" } : undefined}
      className={`relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 font-mono text-neutral-200 shadow-panel outline-none ${
        height ? "" : "h-56 max-h-[30vh]"
      }`}
      onKeyDown={(event) => {
        const action = timelineShortcut(event, {
          frame: Boolean(frame),
          node: Boolean(selectedNode),
          // A keyframe selection whose frame undo removed: consume the
          // destructive keys so they cannot reach the layer underneath.
          stale: Boolean(selected) && !frame,
        });
        if (!action) return;
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation?.();
        if (action === "swallow") return;
        event.preventDefault();
        if (action === "play") togglePlayback();
        if (action === "delete") removeSelected();
        if (action === "split") splitAtPlayhead();
        if (action === "deselect") setSelected(null);
        if (action === "deleteLayer") removeSelectedLayer();
        if (action === "deselectLayer") deselectLayer();
        if (action === "seekBack") seekByFrame(-1);
        if (action === "seekFwd") seekByFrame(1);
        if (action === "seekStart") seek(0);
        if (action === "seekEnd") seek(duration);
      }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("editor.motion.resizeTimeline")}
        aria-valuenow={Math.round(
          timelineRef.current?.getBoundingClientRect().height ?? 0,
        )}
        data-testid="editor-motion-resize"
        tabIndex={0}
        title={t("editor.motion.resizeTimeline")}
        className="group absolute inset-x-0 top-0 z-30 flex h-3 cursor-ns-resize touch-none items-start justify-center outline-none"
        onPointerDown={beginResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={() => applyHeight(null, { persist: true })}
        onKeyDown={(event) => {
          const current =
            timelineRef.current?.getBoundingClientRect().height ?? 0;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            applyHeight(
              current +
                (event.key === "ArrowUp"
                  ? TIMELINE_HEIGHT_STEP
                  : -TIMELINE_HEIGHT_STEP),
              { persist: true },
            );
          }
        }}
      >
        <span className="mt-1 h-1 w-16 rounded-full bg-white/15 transition-colors group-hover:bg-white/40 group-focus-visible:bg-[#a7ffd4]" />
      </div>
      <MotionTransportControls
        time={time}
        duration={duration}
        fps={fps}
        playing={playing}
        exporting={exporting}
        exportProgress={exportProgress}
        showExport={Boolean(onExport)}
        onTogglePlayback={togglePlayback}
        onDuration={(value) =>
          // One write: the composition and any keyframe it would strand have
          // to land together, or undo leaves half a resize behind.
          perform(() => {
            engine.setDoc(
              applyTimelinePatch(engine.getDocument(), {
                duration: value,
                fps,
              }),
            );
            engine.seekToTime(time);
          })
        }
        onExport={() => void exportMotion()}
        zoom={zoom}
        onZoom={(value) => setZoom(clampTimelineZoom(value))}
        canSplit={canSplit}
        onSplit={splitAtPlayhead}
        loop={playback.loop === true}
        onLoop={(loop) => perform(() => engine.setTimeline({ loop }))}
        onClose={() => {
          engine.pause();
          onClose();
        }}
        t={t}
      />
      {/* Before a layer has any track this is the way to add the first key;
          afterwards the row diamonds take over and it edits a selected key. */}
      {frame || editNode ? (
        <MotionPropertyControls
          selectedNode={editNode}
          propertyOptions={propertyOptions}
          property={property}
          propertyState={propertyState}
          onChooseProperty={(next) => {
            setChosenProperty(next);
            setSelected(null);
          }}
          onChangeValue={setCurrentValue}
          onToggleFrame={toggleCurrentFrame}
          t={t}
        />
      ) : null}
      <MotionTrackArea
        doc={doc}
        expandedRows={expandedRows}
        time={time}
        duration={duration}
        fps={fps}
        selected={frame ? selected : null}
        selectedNode={selectedNode}
        selectedInstanceChild={selectedInstanceChild}
        sourceEditable={Boolean(sourceEngine)}
        onSelect={selectFrame}
        onSeek={seek}
        onMove={moveFrame}
        onSelectNode={(id, row) =>
          perform(() => {
            if (row.scope === "source")
              onSelectInstanceChild?.({
                instanceId: row.instanceId,
                sourceCanvasId: row.sourceCanvasId,
                nodeId: id,
              });
            else {
              engine.selectExactly([id]);
              onSelectInstanceChild?.(null);
            }
            setSelected(null);
            setChosenProperty("x");
          })
        }
        zoom={zoom}
        onToggleTrack={(nodeId, property) =>
          perform(() => {
            setSelected(toggleTimelineKeyframe(engine, nodeId, property));
            setChosenProperty(property);
          })
        }
        onClipEdit={editClip}
        getMediaMetadata={engine.getMediaPlaybackMetadata}
        getMediaSrc={engine.getMediaSrc}
        t={t}
      />
      <MotionFrameControls
        frame={frame}
        displayTime={selected?.hostTime ?? frame?.time ?? 0}
        duration={duration}
        fps={fps}
        onMove={(next) => moveFrame(selected, next)}
        onEasing={(easing) =>
          perform(() => {
            if (selected?.instanceId) {
              if (source?.instance?.id !== selected.instanceId) return;
              engine.pause();
              updateLocalSourceTrack(
                engine,
                source,
                selected.property,
                time,
                (node) =>
                  upsertNodeKeyframe(node, selected.property, {
                    ...frame,
                    easing,
                  }),
              );
            } else {
              engine.pause();
              engine.upsertKeyframe(selected.nodeId, selected.property, {
                ...frame,
                easing,
              });
            }
          })
        }
        onRemove={removeSelected}
        t={t}
      />
      {error || mediaError ? (
        <p
          role="alert"
          className="shrink-0 bg-rose-500/10 px-3 py-1 text-[11px] text-rose-400"
        >
          {error || mediaError}
        </p>
      ) : null}
    </section>
  );
}

MotionTimeline.propTypes = {
  engine: PropTypes.object.isRequired,
  doc: PropTypes.object,
  selectedNode: PropTypes.object,
  selectedInstanceChild: PropTypes.object,
  sourceEngine: PropTypes.object,
  sourceDoc: PropTypes.object,
  instanceSources: PropTypes.array,
  onSelectInstanceChild: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  onExport: PropTypes.func,
  onHeightChange: PropTypes.func,
  mediaError: PropTypes.string,
};
