/** Image actions for an image layer: crop, replace and fit / fill (formerly the top context bar). */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { CollapsibleSection, fieldClass } from "./property_section.jsx";

const BUTTON_CLASS = `${fieldClass} cursor-pointer text-center`;

/**
 * Scale the layer to fit inside (`fit`) or cover (`fill`) its parent box and
 * centre it. Returns null when either box has no usable size.
 */
export function fitImageToParent(object, parent, mode) {
  if (!parent?.width || !parent?.height || !object.width || !object.height) return null;
  const scale = Math[mode === "fit" ? "min" : "max"](parent.width / object.width, parent.height / object.height);
  const width = object.width * scale;
  const height = object.height * scale;
  return {
    width,
    height,
    x: (parent.x ?? 0) + (parent.width - width) / 2,
    y: (parent.y ?? 0) + (parent.height - height) / 2,
  };
}

export default function ImageSection({ object, engine = null, editAndCommit }) {
  const { t } = useI18n();

  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => engine?.replaceNodeBitmap?.(object.id, reader.result);
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const onFit = (event) => {
    const doc = engine?.getDocument?.();
    const parent = doc?.nodes?.find((node) => node.id === object.parentId) ?? doc;
    const patch = fitImageToParent(object, parent, event.target.value);
    if (patch) editAndCommit(patch);
    event.target.value = "";
  };

  return (
    <CollapsibleSection title={t("editor.context.image")} storageKey="image" testId="editor-image-section">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={BUTTON_CLASS} onClick={() => engine?.setTool?.("crop")}>
          {t("editor.taskbar.crop")}
        </button>
        {/* A label around a visually hidden (still focusable) file input: no ref or click proxy needed. */}
        <label className={`${BUTTON_CLASS} flex items-center justify-center focus-within:ring-1 focus-within:ring-[#a7ffd4]/40`}>
          {t("editor.taskbar.replace")}
          <input type="file" accept="image/*" onChange={onFile} className="sr-only" />
        </label>
      </div>
      <select aria-label={t("editor.image.fitFill")} defaultValue="" onChange={onFit} className={`${fieldClass} cursor-pointer`}>
        <option value="" disabled>{t("editor.image.fitFill")}</option>
        <option value="fit">{t("editor.image.fit")}</option>
        <option value="fill">{t("editor.image.fill")}</option>
      </select>
    </CollapsibleSection>
  );
}

ImageSection.propTypes = {
  object: PropTypes.object.isRequired,
  engine: PropTypes.object,
  editAndCommit: PropTypes.func.isRequired,
};
