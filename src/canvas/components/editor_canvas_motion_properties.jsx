import PropTypes from "prop-types";
import { useState } from "react";
import { applyTimelinePatch, normalizeTimeline } from "../editor/scene-motion.js";
import { normalizeCornerRadius } from "../editor/scene_model_core.js";
import { useI18n } from "../use_i18n.js";
import ColourSection from "./editor_properties/colour_section.jsx";
import { usePropertyCommit } from "./editor_properties/use_property_commit.js";
import {
  InspectorGroup,
  InspectorRow,
  InspectorSwitch,
} from "./editor-3d/three-inspector.jsx";
import ThreeModifiersGroup from "./editor-3d/three-modifiers-group.jsx";
import VectorRow from "./editor-3d/three-vector-row.jsx";
import { MotionFieldProvider } from "./editor_motion/motion-field-context.jsx";
import { retimeVideoClipPatch } from "./editor_motion/motion-clip-edit.js";
import {
  reanchorAnimationsToClip,
  timelineFieldValue,
} from "./editor_motion/motion-timeline-model.js";

const FIELD_CLASS =
  "h-7 w-20 rounded-xl bg-neutral-800 transition-colors hover:bg-neutral-800/80 px-2 text-right text-[11px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";
const OPACITY_PERCENT = {
  toDisplay: (value) => value * 100,
  fromDisplay: (value) => value / 100,
};

/**
 * Motion mode's inspector, laid out like Figma Motion: animation presets
 * first, then the properties you can animate, each with its keyframe diamond,
 * then the composition's own timing.
 */
function LayerFields({ engine, node, duration, t }) {
  // Proportional scaling is a per-layer editing aid, not document data.
  const [lockScale, setLockScale] = useState(false);
  const patch = (fields) =>
    engine.updateNode(node.id, fields, { commit: false });
  const commit = () => engine.commit("editor.history.entry.layer");
  const {
    edit: editStyle,
    editAndCommit: editStyleAndCommit,
    commitNow,
  } = usePropertyCommit({ onMutate: patch, onCommit: commit });
  const patchSize = (key, value) => {
    const current = { width: node.width, height: node.height };
    if (!lockScale || !(current[key] > 0)) return patch({ [key]: value });
    const ratio = value / current[key];
    return patch({ width: node.width * ratio, height: node.height * ratio });
  };
  const opacity = Number.isFinite(node.opacity) ? node.opacity : 1;
  return (
    <>
      <ThreeModifiersGroup
        node={node}
        duration={duration}
        onPatchNode={(id, fields) =>
          engine.updateNode(
            id,
            // Presets are keyed against the composition; the layer's clip may
            // not cover it. The only patch this callback ever receives is a
            // preset's tracks, so re-anchor them where the layer is visible.
            fields?.animations
              ? {
                  ...fields,
                  animations: reanchorAnimationsToClip(
                    node,
                    fields.animations,
                    duration,
                  ),
                }
              : fields,
            { commit: false },
          )
        }
        onCommit={commit}
        t={t}
        titleKey="editor.motion.animations"
        defaultOpen
        testId="editor-motion-animations-group"
      />
      <InspectorGroup
        title={t("editor.three.transform")}
        testId="editor-motion-transform-group"
      >
        <VectorRow
          testId="editor-motion-position"
          label={t("editor.three.position")}
          fields={["x", "y"].map((axis) => ({
            axis: axis.toUpperCase(),
            property: axis,
            ariaLabel: t(`editor.three.position${axis.toUpperCase()}`),
            value: node[axis],
            onChange: (value) => patch({ [axis]: value }),
            onCommit: commit,
          }))}
        />
        <VectorRow
          testId="editor-motion-scale"
          label={t("editor.three.scale")}
          lock={{
            locked: lockScale,
            onToggle: () => setLockScale((locked) => !locked),
            label: t("editor.three.lockScale"),
          }}
          fields={["width", "height"].map((key) => ({
            axis: key === "width" ? "W" : "H",
            property: key,
            ariaLabel: t(`editor.three.${key}`),
            value: node[key],
            min: 1,
            onChange: (value) => patchSize(key, value),
            onCommit: commit,
          }))}
        />
        <VectorRow
          testId="editor-motion-rotation"
          label={t("editor.three.rotation")}
          fields={[
            {
              axis: "R",
              property: "rotation",
              ariaLabel: t("editor.media.rotationZ"),
              value: node.rotation ?? 0,
              onChange: (value) => patch({ rotation: value }),
              onCommit: commit,
            },
          ]}
        />
      </InspectorGroup>
      <InspectorGroup
        title={t("editor.motion.appearance")}
        testId="editor-motion-appearance-group"
      >
        <VectorRow
          testId="editor-motion-opacity"
          label={t("editor.motion.opacity")}
          fields={[
            {
              axis: "%",
              property: "opacity",
              ariaLabel: t("editor.motion.opacity"),
              value: opacity * 100,
              min: 0,
              max: 100,
              adapter: OPACITY_PERCENT,
              onChange: (value) => patch({ opacity: value / 100 }),
              onCommit: commit,
            },
          ]}
        />
        {node.kind === "rect" ? (
          <>
            <VectorRow
              testId="editor-motion-corner-radius"
              label={t("editor.props.cornerRadius")}
              fields={[
                {
                  axis: "R",
                  ariaLabel: t("editor.props.cornerRadius"),
                  value: normalizeCornerRadius(node.cornerRadius),
                  min: 0,
                  max: Math.max(
                    0,
                    Math.floor(Math.min(node.width, node.height) / 2),
                  ),
                  onChange: (value) => editStyle({ cornerRadius: value }),
                  onCommit: commitNow,
                },
              ]}
            />
            <div data-testid="editor-motion-rect-style">
              <ColourSection
                object={node}
                edit={editStyle}
                editAndCommit={editStyleAndCommit}
                commitNow={commitNow}
              />
            </div>
          </>
        ) : null}
      </InspectorGroup>
    </>
  );
}

LayerFields.propTypes = {
  engine: PropTypes.object.isRequired,
  node: PropTypes.object.isRequired,
  duration: PropTypes.number.isRequired,
  t: PropTypes.func.isRequired,
};

export function validateMediaPatch(key, rawValue, current = {}) {
  const value = key === "outPoint" && rawValue === "" ? null : Number(rawValue);
  if (value !== null && !Number.isFinite(value)) return { valid: false };
  if (key === "speed" && !(value > 0)) return { valid: false };
  if (key === "volume" && !(value >= 0 && value <= 1)) return { valid: false };
  if ((key === "fadeIn" || key === "fadeOut" || key === "inPoint") && !(value >= 0))
    return { valid: false };
  const media = { ...current?.media, [key]: value };
  if (media.outPoint != null && media.outPoint <= (media.inPoint ?? 0)) {
    return { valid: false, error: "editor.media.invalidTrim" };
  }
  return { valid: true, value, media };
}

/** Footage and sound share one editor; only the rows they own differ. */
export function VideoFields({ engine, node, onPatchNode, t }) {
  const [fieldError, setFieldError] = useState(null);
  const isAudio = node.kind === "audio";
  const currentVideoNode = () => {
    const current = engine
      .getDocument()
      .nodes.find((entry) => entry.id === node.id);
    if (current?.kind !== node.kind)
      throw new Error("Selected media clip is unavailable");
    return current;
  };
  const patchMedia = (key, event) => {
    const current = currentVideoNode();
    const result = validateMediaPatch(key, event.target.value, current);
    if (!result.valid) {
      if (result.error) setFieldError(t(result.error));
      return;
    }
    try {
      const patch =
        key === "speed"
          ? retimeVideoClipPatch(
              current,
              result.value,
              engine.getDocument().timeline.duration,
              engine.getMediaPlaybackMetadata(current.id)?.duration,
            )
          : { media: result.media };
      setFieldError(null);
      onPatchNode(node.id, patch);
    } catch (cause) {
      if (!(cause instanceof RangeError)) throw cause;
      setFieldError(t("editor.media.speedExceedsDuration"));
    }
  };
  return (
    <InspectorGroup
      title={t(isAudio ? "editor.media.audio" : "editor.media.video")}
      defaultOpen
    >
      {fieldError ? (
        <p
          role="alert"
          className="rounded-lg bg-rose-500/10 px-2 py-1 text-[11px] text-rose-400"
        >
          {fieldError}
        </p>
      ) : null}
      <InspectorRow label={t("editor.media.trimIn")}>
        <input
          type="number"
          min="0"
          step="0.1"
          aria-label={t("editor.media.trimIn")}
          value={node.media?.inPoint ?? 0}
          onChange={(event) => patchMedia("inPoint", event)}
          className={FIELD_CLASS}
        />
      </InspectorRow>
      <InspectorRow label={t("editor.media.trimOut")}>
        <input
          type="number"
          min="0"
          step="0.1"
          aria-label={t("editor.media.trimOut")}
          value={node.media?.outPoint ?? ""}
          placeholder={t("editor.media.auto")}
          onChange={(event) => patchMedia("outPoint", event)}
          className={FIELD_CLASS}
        />
      </InspectorRow>
      {isAudio ? null : (
        <InspectorRow label={t("editor.media.speed")}>
          <input
            type="number"
            min="0.01"
            step="0.1"
            aria-label={t("editor.media.speed")}
            value={node.media?.speed ?? 1}
            onChange={(event) => patchMedia("speed", event)}
            className={FIELD_CLASS}
          />
        </InspectorRow>
      )}
      <InspectorRow label={t("editor.media.volume")}>
        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          aria-label={t("editor.media.volume")}
          value={node.media?.volume ?? 1}
          onChange={(event) => patchMedia("volume", event)}
          className={FIELD_CLASS}
        />
      </InspectorRow>
      {isAudio ? (
        <>
          <InspectorRow label={t("editor.media.fadeIn")}>
            <input
              type="number"
              min="0"
              step="0.1"
              aria-label={t("editor.media.fadeIn")}
              value={node.media?.fadeIn ?? 0}
              onChange={(event) => patchMedia("fadeIn", event)}
              className={FIELD_CLASS}
            />
          </InspectorRow>
          <InspectorRow label={t("editor.media.fadeOut")}>
            <input
              type="number"
              min="0"
              step="0.1"
              aria-label={t("editor.media.fadeOut")}
              value={node.media?.fadeOut ?? 0}
              onChange={(event) => patchMedia("fadeOut", event)}
              className={FIELD_CLASS}
            />
          </InspectorRow>
        </>
      ) : null}
      <InspectorRow label={t("editor.media.muted")}>
        <InspectorSwitch
          checked={Boolean(node.media?.muted)}
          label={t("editor.media.muted")}
          onChange={(muted) => {
            const current = currentVideoNode();
            onPatchNode(current.id, { media: { ...current.media, muted } });
          }}
        />
      </InspectorRow>
    </InspectorGroup>
  );
}

VideoFields.propTypes = {
  engine: PropTypes.object.isRequired,
  node: PropTypes.object.isRequired,
  onPatchNode: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};

export default function EditorCanvasMotionProperties({
  engine,
  doc,
  selected,
  onPatchTimeline,
  onPatchNode,
}) {
  const { t } = useI18n();
  const timeline = normalizeTimeline(doc.timeline);
  /**
   * A timeline edit the composition can hold. Shrinking it also has to move
   * the keyframes it would strand, and those two halves must land in one
   * write — otherwise undo restores a duration that no longer matches the
   * frames sitting outside it.
   */
  const patchTimeline = (patch) => {
    const live = engine?.getDocument?.() ?? doc;
    const next = applyTimelinePatch(live, patch);
    const stranded = next.nodes.some(
      (node, index) => node !== live.nodes[index],
    );
    if (stranded && engine) {
      engine.setDoc(next);
      return;
    }
    onPatchTimeline(patch);
  };
  const patchPositive = (key, event) => {
    const value = timelineFieldValue(key, event.target.value, {
      fps: timeline.fps,
    });
    if (value === null) return;
    patchTimeline({ [key]: value });
  };
  return (
    <div data-testid="editor-motion-properties" className="ui-scroll w-full">
      {selected && engine ? (
        <MotionFieldProvider engine={engine} nodeId={selected.id}>
          {selected.kind === "audio" ? (
            <VideoFields
              key={selected.id}
              engine={engine}
              node={selected}
              onPatchNode={onPatchNode}
              t={t}
            />
          ) : (
            <LayerFields
              key={selected.id}
              engine={engine}
              node={selected}
              duration={timeline.duration}
              t={t}
            />
          )}
          {selected.kind === "video" ? (
            <VideoFields
              key={selected.id}
              engine={engine}
              node={selected}
              onPatchNode={onPatchNode}
              t={t}
            />
          ) : null}
        </MotionFieldProvider>
      ) : null}
      <InspectorGroup
        title={t("editor.motion.timeline")}
        defaultOpen={!selected}
        testId="editor-motion-timeline-group"
      >
        <InspectorRow label={t("editor.motion.duration")}>
          <input
            type="number"
            min={1 / timeline.fps}
            step="0.1"
            value={timeline.duration}
            onChange={(event) => patchPositive("duration", event)}
            aria-label={t("editor.motion.duration")}
            className={FIELD_CLASS}
          />
        </InspectorRow>
        <InspectorRow label={t("editor.motion.fps")}>
          <input
            type="number"
            min="1"
            max="120"
            step="1"
            value={timeline.fps}
            onChange={(event) => patchPositive("fps", event)}
            aria-label={t("editor.motion.fps")}
            className={FIELD_CLASS}
          />
        </InspectorRow>
        <InspectorRow label={t("editor.motion.loop")}>
          <InspectorSwitch
            checked={timeline.loop === true}
            label={t("editor.motion.loop")}
            onChange={(loop) => onPatchTimeline({ loop })}
          />
        </InspectorRow>
      </InspectorGroup>
    </div>
  );
}

EditorCanvasMotionProperties.propTypes = {
  engine: PropTypes.object,
  doc: PropTypes.object.isRequired,
  selected: PropTypes.object,
  onPatchTimeline: PropTypes.func.isRequired,
  onPatchNode: PropTypes.func.isRequired,
};
