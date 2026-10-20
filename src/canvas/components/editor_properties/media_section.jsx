import { EDITOR_BETA_ENABLED } from "../../editor-beta-features.js";
import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { useMotionField } from "../editor_motion/motion-field-context.jsx";
import MotionKeyframeControls from "../editor_motion/motion_keyframe_controls.jsx";
import { retimeVideoClipPatch } from "../editor_motion/motion-clip-edit.js";
import { normalizeTimeline } from "../../editor/scene-motion.js";
import { CollapsibleSection, fieldClass } from "./property_section.jsx";

const NUMBER_FIELDS = {
  video: [
    ["inPoint", "editor.media.trimIn", 0, 86400, 0.01],
    ["outPoint", "editor.media.trimOut", 0, 86400, 0.01],
    ["speed", "editor.media.speed", 0.01, 16, 0.01],
    ["volume", "editor.media.volume", 0, 1, 0.01],
  ],
  audio: [
    ["inPoint", "editor.media.trimIn", 0, 86400, 0.01],
    ["outPoint", "editor.media.trimOut", 0, 86400, 0.01],
    ["volume", "editor.media.volume", 0, 1, 0.01],
    ["fadeIn", "editor.media.fadeIn", 0, 600, 0.1],
    ["fadeOut", "editor.media.fadeOut", 0, 600, 0.1],
  ],
  rotation: [
    ["x", "editor.media.rotationX", -360, 360, 1],
    ["y", "editor.media.rotationY", -360, 360, 1],
    ["z", "editor.media.rotationZ", -360, 360, 1],
  ],
  camera: [
    ["azimuth", "editor.media.azimuth", -360, 360, 1],
    ["elevation", "editor.media.elevation", -90, 90, 1],
    ["distance", "editor.media.distance", 0.1, 100, 0.1],
    ["fov", "editor.media.fov", 1, 179, 1],
  ],
  material: [
    ["metalness", "editor.media.metalness", 0, 1, 0.01],
    ["roughness", "editor.media.roughness", 0, 1, 0.01],
  ],
};

function NumberField({
  motionProperty,
  label,
  value,
  min,
  max,
  step,
  nullable,
  onChange,
  onCommit,
  t,
}) {
  const field = useMotionField(motionProperty, value, onChange, onCommit);
  const displayValue = field.value;
  const [draft, setDraft] = useState(
    displayValue == null ? "" : String(displayValue),
  );
  useEffect(
    () => setDraft(displayValue == null ? "" : String(displayValue)),
    [displayValue],
  );
  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400">
      <span className="w-20 shrink-0">{t(label)}</span>
      <input
        className={`${fieldClass} min-w-0 flex-1 pr-2`}
        type="number"
        aria-label={t(label)}
        min={min}
        max={max}
        step={step}
        value={draft}
        placeholder={nullable ? t("editor.media.auto") : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (nullable && raw === "") {
            field.onChange(null);
            return;
          }
          const next = Number(raw);
          if (
            raw !== "" &&
            Number.isFinite(next) &&
            next >= min &&
            next <= max
          ) {
            field.onChange(next);
          }
        }}
        onBlur={() => {
          setDraft(displayValue == null ? "" : String(displayValue));
          field.onCommit?.();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {field.motion ? (
        <MotionKeyframeControls
          property={motionProperty}
          motion={field.motion}
        />
      ) : null}
    </div>
  );
}

NumberField.propTypes = {
  motionProperty: PropTypes.string,
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number.isRequired,
  nullable: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};

function MediaFields({
  fields,
  values,
  onChange,
  onCommit,
  t,
  nullableField = null,
  motionPrefix = null,
}) {
  return fields.map(([key, label, min, max, step]) => (
    <NumberField
      key={key}
      motionProperty={motionPrefix ? `${motionPrefix}.${key}` : undefined}
      label={label}
      value={values?.[key] ?? null}
      min={min}
      max={max}
      step={step}
      nullable={key === nullableField}
      onChange={(value) => onChange(key, value)}
      onCommit={onCommit}
      t={t}
    />
  ));
}

MediaFields.propTypes = {
  motionPrefix: PropTypes.string,
  fields: PropTypes.array.isRequired,
  values: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
  nullableField: PropTypes.string,
};

export default function MediaSection({
  object,
  engine,
  edit,
  editAndCommit,
  commitNow,
  t,
  error,
}) {
  const [fieldError, setFieldError] = useState(null);
  const isVideo = object.kind === "video";
  const isAudio = object.kind === "audio";
  const isModel = object.kind === "model3d";
  if ((!isVideo && !isAudio && !isModel) || (isModel && !EDITOR_BETA_ENABLED))
    return null;

  const media = object.media ?? {};
  const model = object.model ?? {};
  const currentMediaObject = () => {
    const current = engine
      ? engine.getDocument().nodes.find((node) => node.id === object.id)
      : object;
    if (!current) throw new Error("Selected video clip is unavailable");
    return current;
  };
  const patchMedia = (key, value) => {
    const current = currentMediaObject();
    const next = { ...current.media, [key]: value };
    if (next.outPoint !== null && next.outPoint <= (next.inPoint ?? 0)) {
      setFieldError(t("editor.media.invalidTrim"));
      return;
    }
    if (key === "speed" && engine) {
      try {
        // A design canvas has no timeline of its own; use the default span.
        const { duration } = normalizeTimeline(engine.getDocument().timeline);
        const mediaDuration = engine.getMediaPlaybackMetadata(
          object.id,
        )?.duration;
        const patch = retimeVideoClipPatch(
          current,
          value,
          duration,
          mediaDuration,
        );
        setFieldError(null);
        edit(patch);
      } catch (cause) {
        if (!(cause instanceof RangeError)) throw cause;
        setFieldError(t("editor.media.speedExceedsDuration"));
      }
      return;
    }
    setFieldError(null);
    edit({ media: next });
  };
  const patchModel = (key, value) =>
    edit({ model: { ...model, [key]: value } });
  const patchNested = (key, field, value) =>
    edit({ model: { ...model, [key]: { ...model[key], [field]: value } } });

  return (
    <CollapsibleSection
      title={t(
        isVideo
          ? "editor.media.video"
          : isAudio
            ? "editor.media.audio"
            : "editor.media.model",
      )}
    >
      {error || fieldError ? (
        <p
          role="alert"
          className="rounded-lg bg-rose-500/10 px-2 py-1 text-[11px] text-rose-400"
        >
          {fieldError || error}
        </p>
      ) : null}
      {isVideo ? (
        <div className="flex flex-col gap-2">
          <MediaFields
            fields={NUMBER_FIELDS.video}
            values={media}
            onChange={patchMedia}
            onCommit={commitNow}
            nullableField="outPoint"
            t={t}
          />
          <label className="flex items-center gap-2 text-[11px] text-neutral-300">
            <input
              className="flat-check"
              type="checkbox"
              checked={Boolean(media.muted)}
              onChange={(event) =>
                editAndCommit({
                  media: {
                    ...currentMediaObject().media,
                    muted: event.target.checked,
                  },
                })
              }
            />
            {t("editor.media.muted")}
          </label>
        </div>
      ) : isAudio ? (
        <div className="flex flex-col gap-2">
          <MediaFields
            fields={NUMBER_FIELDS.audio}
            values={media}
            onChange={patchMedia}
            onCommit={commitNow}
            nullableField="outPoint"
            t={t}
          />
          <label className="flex items-center gap-2 text-[11px] text-neutral-300">
            <input
              className="flat-check"
              type="checkbox"
              checked={Boolean(media.muted)}
              onChange={(event) =>
                editAndCommit({
                  media: {
                    ...currentMediaObject().media,
                    muted: event.target.checked,
                  },
                })
              }
            />
            {t("editor.media.muted")}
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <MediaFields
            fields={NUMBER_FIELDS.rotation}
            motionPrefix="model.rotation"
            values={model.rotation}
            onChange={(key, value) => patchNested("rotation", key, value)}
            onCommit={commitNow}
            t={t}
          />
          <NumberField
            motionProperty="model.scale"
            label="editor.media.scale"
            value={model.scale ?? 1}
            min={0.01}
            max={100}
            step={0.01}
            onChange={(value) => patchModel("scale", value)}
            onCommit={commitNow}
            t={t}
          />
          <MediaFields
            fields={NUMBER_FIELDS.camera}
            motionPrefix="model.camera"
            values={model.camera}
            onChange={(key, value) => patchNested("camera", key, value)}
            onCommit={commitNow}
            t={t}
          />
          <label className="flex items-center gap-2 text-[11px] text-neutral-400">
            <span className="w-20 shrink-0">{t("editor.media.color")}</span>
            <input
              className="h-8 min-w-0 flex-1 rounded-lg bg-[#222222]"
              type="color"
              value={
                /^#[\da-fA-F]{6}$/.test(model.color ?? "")
                  ? model.color
                  : "#ffffff"
              }
              onChange={(event) =>
                editAndCommit({
                  model: { ...model, color: event.target.value },
                })
              }
            />
          </label>
          <MediaFields
            fields={NUMBER_FIELDS.material}
            values={model}
            onChange={patchModel}
            onCommit={commitNow}
            t={t}
          />
          <NumberField
            motionProperty="model.exposure"
            label="editor.media.exposure"
            value={model.exposure ?? 1}
            min={0}
            max={10}
            step={0.01}
            onChange={(value) => patchModel("exposure", value)}
            onCommit={commitNow}
            t={t}
          />
          <label className="flex items-center gap-2 text-[11px] text-neutral-400">
            <span className="w-20 shrink-0">
              {t("editor.media.environment")}
            </span>
            <select
              className={`${fieldClass} min-w-0 flex-1 pr-2`}
              value={model.environment ?? "studio"}
              onChange={(event) =>
                editAndCommit({
                  model: { ...model, environment: event.target.value },
                })
              }
              onKeyDown={(event) => event.stopPropagation()}
            >
              <option value="studio">
                {t("editor.media.environmentStudio")}
              </option>
              <option value="neutral">
                {t("editor.media.environmentNeutral")}
              </option>
            </select>
          </label>
        </div>
      )}
    </CollapsibleSection>
  );
}

MediaSection.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  t: PropTypes.func.isRequired,
  error: PropTypes.string,
};
