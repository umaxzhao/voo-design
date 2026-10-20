import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { normalizeAutoLayout } from "../../editor/scene_auto_layout.js";
import { CollapsibleSection } from "./property_section.jsx";

const DEFAULT_LAYOUT = {
  direction: "vertical",
  gap: 8,
  padding: 0,
  alignItems: "start",
  justifyContent: "start",
  widthMode: "fixed",
  heightMode: "hug",
};

const FIELD_CLASS =
  "w-full min-w-0 rounded-lg bg-[#222222] px-2 py-1.5 text-[11px] tabular-nums text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF]/40";

export default function AutoLayoutSection({ object, editAndCommit }) {
  const { t } = useI18n();
  const layout = normalizeAutoLayout(object.autoLayout);
  const change = (patch) =>
    editAndCommit({ autoLayout: { ...layout, ...patch } });
  const numericField = (key, label, value, onChange) => (
    <label
      key={key}
      className="flex min-w-0 flex-col gap-1 text-[10px] text-neutral-400"
    >
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        className={FIELD_CLASS}
        aria-label={label}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.max(0, next));
        }}
      />
    </label>
  );

  return (
    <CollapsibleSection
      title={t("editor.autoLayout.title")}
      storageKey="autoLayout.group"
    >
      {!layout ? (
        <button
          type="button"
          data-testid="editor-auto-layout-enable"
          onClick={() => editAndCommit({ autoLayout: DEFAULT_LAYOUT })}
          className="w-full rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-neutral-200 hover:bg-white/[0.12]"
        >
          {t("editor.autoLayout.enable")}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {["vertical", "horizontal"].map((direction) => (
              <button
                key={direction}
                type="button"
                aria-pressed={layout.direction === direction}
                onClick={() => change({ direction })}
                className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[11px] ${
                  layout.direction === direction
                    ? "bg-[#E5B2FF]/20 text-[#eed0ff]"
                    : "bg-white/[0.06] text-neutral-400"
                }`}
              >
                {t(`editor.autoLayout.${direction}`)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {numericField(
              "gap",
              t("editor.autoLayout.gap"),
              layout.gap,
              (gap) => change({ gap }),
            )}
            {numericField(
              "paddingTop",
              t("editor.autoLayout.paddingTop"),
              layout.padding.top,
              (top) => change({ padding: { ...layout.padding, top } }),
            )}
            {numericField(
              "paddingRight",
              t("editor.autoLayout.paddingRight"),
              layout.padding.right,
              (right) => change({ padding: { ...layout.padding, right } }),
            )}
            {numericField(
              "paddingBottom",
              t("editor.autoLayout.paddingBottom"),
              layout.padding.bottom,
              (bottom) => change({ padding: { ...layout.padding, bottom } }),
            )}
            {numericField(
              "paddingLeft",
              t("editor.autoLayout.paddingLeft"),
              layout.padding.left,
              (left) => change({ padding: { ...layout.padding, left } }),
            )}
          </div>
          <label className="flex items-center justify-between gap-2 text-[10px] text-neutral-400">
            <span>{t("editor.autoLayout.align")}</span>
            <select
              aria-label={t("editor.autoLayout.align")}
              className={FIELD_CLASS}
              value={layout.alignItems}
              onChange={(event) => change({ alignItems: event.target.value })}
            >
              {["start", "center", "end"].map((value) => (
                <option key={value} value={value}>
                  {t(`editor.autoLayout.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-[10px] text-neutral-400">
            <span>{t("editor.autoLayout.justify")}</span>
            <select
              aria-label={t("editor.autoLayout.justify")}
              className={FIELD_CLASS}
              value={layout.justifyContent}
              onChange={(event) =>
                change({ justifyContent: event.target.value })
              }
            >
              {["start", "center", "end", "space-between"].map((value) => (
                <option key={value} value={value}>
                  {t(`editor.autoLayout.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {["widthMode", "heightMode"].map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-2 text-[10px] text-neutral-400"
            >
              <span>{t(`editor.autoLayout.${key}`)}</span>
              <select
                aria-label={t(`editor.autoLayout.${key}`)}
                className={FIELD_CLASS}
                value={layout[key]}
                onChange={(event) => change({ [key]: event.target.value })}
              >
                {["fixed", "hug"].map((value) => (
                  <option key={value} value={value}>
                    {t(`editor.autoLayout.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            onClick={() => editAndCommit({ autoLayout: null })}
            className="self-start rounded-lg px-2 py-1 text-[10px] text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
          >
            {t("editor.autoLayout.disable")}
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}

AutoLayoutSection.propTypes = {
  object: PropTypes.object.isRequired,
  editAndCommit: PropTypes.func.isRequired,
};
