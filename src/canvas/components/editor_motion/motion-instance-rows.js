import { motionRows } from "./motion-timeline-model.js";
import { normalizeTimeline } from "../../editor/scene-motion.js";
import { hostTimesForSourceFrame } from "../../editor/instance-motion-time.js";
import { applyInstanceOverrides } from "../../editor/instance-overrides.js";

/** Keep the host's order while showing the selected instance's master tracks below it. */
export function combinedMotionRows(
  hostDoc,
  sourceDoc,
  selectedInstanceChild,
  instanceSources = [],
) {
  const hostNodes = hostDoc?.nodes ?? [];
  const sources = new Map();
  for (const entry of instanceSources) {
    if (entry?.instanceId && entry?.sourceCanvasId && entry.doc)
      sources.set(
        JSON.stringify([entry.instanceId, entry.sourceCanvasId]),
        entry,
      );
  }
  if (selectedInstanceChild && sourceDoc) {
    const selectedKey = JSON.stringify([
      selectedInstanceChild.instanceId,
      selectedInstanceChild.sourceCanvasId,
    ]);
    if (!sources.has(selectedKey))
      sources.set(selectedKey, {
        ...selectedInstanceChild,
        doc: sourceDoc,
      });
  }

  const byInstanceId = new Map();
  for (const entry of sources.values()) {
    const instance = hostNodes.find(
      (node) =>
        node.id === entry.instanceId &&
        node.kind === "canvasInstance" &&
        node.sourceCanvasId === entry.sourceCanvasId &&
        (!hostDoc?.canvasId || node.sourceCanvasId !== hostDoc.canvasId),
    );
    if (!instance) continue;
    const effectiveDoc = applyInstanceOverrides(entry.doc, instance.instance);
    const sourceDuration = normalizeTimeline(effectiveDoc.timeline).duration;
    const playbackStart = instance.instance?.playbackStart ?? 0;
    const childRows = motionRows(effectiveDoc)
      .filter((row) => row.tracks.length > 0)
      .map((row) => ({
        ...row,
        scope: "source",
        instanceId: instance.id,
        sourceCanvasId: instance.sourceCanvasId,
        identity: {
          instanceId: instance.id,
          sourceCanvasId: instance.sourceCanvasId,
          nodeId: row.node.id,
        },
        parentIdentity: {
          instanceId: instance.id,
          sourceCanvasId: instance.sourceCanvasId,
        },
        playbackStart,
        sourceDuration,
      }));
    if (!childRows.length) continue;
    const summaryTimes = new Set();
    for (const row of childRows)
      for (const track of row.tracks)
        for (const frame of track.keyframes ?? [])
          for (const hostTime of hostTimesForSourceFrame(
            frame.time,
            normalizeTimeline(hostDoc.timeline).duration,
            sourceDuration,
            playbackStart,
          ))
            summaryTimes.add(hostTime);
    byInstanceId.set(instance.id, {
      summaryTimes: [...summaryTimes].sort((a, b) => a - b),
      rows: childRows,
    });
  }

  const hostRows = new Map(
    motionRows(hostDoc).map((row) => [row.node.id, { ...row, scope: "host" }]),
  );
  const rows = [];
  for (const node of hostNodes) {
    const nested = byInstanceId.get(node.id);
    const hostRow = hostRows.get(node.id);
    if (hostRow || nested) {
      rows.push({
        ...(hostRow ?? { node, tracks: [], scope: "host" }),
        ...(nested
          ? {
              instanceSummary: true,
              summaryTimes: nested.summaryTimes,
            }
          : {}),
      });
      if (nested) rows.push(...nested.rows);
    }
  }
  return rows;
}
