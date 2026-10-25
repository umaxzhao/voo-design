import PropTypes from "prop-types";
import { useRef, useState } from "react";
import { TOOL } from "../../editor/editor_constants.js";
import { normalizeAdjustments } from "../../editor/scene_model.js";
import { useI18n } from "../../use_i18n.js";
import ScrubField from "../scrub_field.jsx";

const ACTION_BUTTON_CLASS =
  "min-h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-left text-[11px] text-neutral-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";

export default function ImageContextActions({
  object,
  engine,
  editAndCommit,
}) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const frequencyRadiusRef = useRef(null);
  const [frequencyError, setFrequencyError] = useState("");
  if (object?.kind !== "image") return null;

  const applyFrequencySeparation = async () => {
    try {
      await engine?.frequencySeparateSelected?.(
        object.id,
        Number(frequencyRadiusRef.current?.value),
      );
      setFrequencyError("");
    } catch (error) {
      const key =
        typeof error?.message === "string" &&
        error.message.startsWith("editor.frequencySeparation.error.")
          ? error.message
          : "editor.frequencySeparation.error.generic";
      setFrequencyError(t(key));
    }
  };

  const replaceImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => engine?.replaceNodeBitmap?.(object.id, reader.result);
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const applyFitOrFill = (event) => {
    const mode = event.target.value;
    event.target.value = "";
    if (!mode) return;

    const doc = engine?.getDocument?.();
    const parent =
      doc?.nodes?.find((node) => node.id === object.parentId) ?? doc;
    if (!parent?.width || !parent?.height || !object.width || !object.height) {
      return;
    }

    const scale = Math[mode === "fit" ? "min" : "max"](
      parent.width / object.width,
      parent.height / object.height,
    );
    const width = object.width * scale;
    const height = object.height * scale;
    editAndCommit({
      width,
      height,
      x: (parent.x ?? 0) + (parent.width - width) / 2,
      y: (parent.y ?? 0) + (parent.height - height) / 2,
    });
  };

  const adjustments = normalizeAdjustments(object.adjustments);
  const updateAdjustment = (kind, value) => {
    editAndCommit({
      adjustments: {
        ...adjustments,
        [kind]: { ...adjustments[kind], enabled: true, value },
      },
    });
  };

  return (
    // Image-only tools sit in one disclosure, closed until asked; fill, stroke
    // and effects live in the regular panel sections like any rectangle.
    <details
      data-testid="image-context-actions"
      className="mb-3 rounded-lg border border-white/10 bg-white/[0.025] px-2"
    >
      <summary className="cursor-pointer rounded-md py-2 text-[10px] text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]">
        {t("editor.image.tools")}
      </summary>
      <div
        role="group"
        aria-label={t("editor.context.image")}
        className="border-t border-white/10 pb-2 pt-2"
      >
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          data-testid="editor-taskbar-crop"
          aria-label={t("editor.taskbar.crop")}
          className={ACTION_BUTTON_CLASS}
          onClick={() => engine?.setTool?.(TOOL.CROP)}
        >
          {t("editor.taskbar.crop")}
        </button>
        <button
          type="button"
          data-testid="editor-taskbar-replace"
          aria-label={t("editor.taskbar.replace")}
          className={ACTION_BUTTON_CLASS}
          onClick={() => fileInputRef.current?.click()}
        >
          {t("editor.taskbar.replace")}
        </button>
        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={replaceImage}
        />
        <label className="col-span-2 flex min-h-8 items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2 text-[10px] text-neutral-400">
          <span>{t("editor.frequencySeparation.radius")}</span>
          <input
            ref={frequencyRadiusRef}
            type="number"
            min="1"
            max="100"
            defaultValue="10"
            aria-label={t("editor.frequencySeparation.radius")}
            className="h-6 w-14 rounded-md border border-white/10 bg-neutral-900 px-1 text-right text-[11px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
          />
        </label>
        <button
          type="button"
          aria-label={t("editor.frequencySeparation.action")}
          className={`${ACTION_BUTTON_CLASS} col-span-2`}
          onClick={applyFrequencySeparation}
        >
          {t("editor.frequencySeparation.action")}
        </button>
      </div>
      {frequencyError ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-1.5 text-[10px] text-rose-300"
        >
          {frequencyError}
        </p>
      ) : null}
      <details className="mt-2 rounded-lg border border-white/10 bg-white/[0.025] px-2">
        <summary className="cursor-pointer py-2 text-[10px] text-neutral-300">
          {t("editor.taskbar.adjust")}
        </summary>
        <div className="space-y-2 border-t border-white/10 pb-2 pt-2">
          {["brightness", "contrast"].map((kind) => (
            <div
              key={kind}
              className="flex min-h-7 items-center gap-2 text-[10px] text-neutral-400"
            >
              <span aria-hidden="true" className="w-[84px] shrink-0 text-[9px] font-mono uppercase tracking-tight text-neutral-500">
                {t(`editor.adjust.${kind}`)}
              </span>
              <ScrubField
                value={adjustments[kind].value}
                min={-100}
                max={100}
                onValueChange={(next) => updateAdjustment(kind, next)}
                ariaLabel={t(`editor.adjust.${kind}`)}
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
                className="min-w-0 flex-1"
              />
            </div>
          ))}
        </div>
      </details>
      <select
        aria-label={t("editor.image.fitFill")}
        defaultValue=""
        onChange={applyFitOrFill}
        className="mt-2 h-8 w-full rounded-lg border border-white/10 bg-neutral-900 px-2 text-[10px] text-neutral-300 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
      >
        <option value="" disabled>
          {t("editor.image.fitFill")}
        </option>
        <option value="fit">{t("editor.image.fit")}</option>
        <option value="fill">{t("editor.image.fill")}</option>
      </select>
      </div>
    </details>
  );
}

ImageContextActions.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
  editAndCommit: PropTypes.func.isRequired,
};
