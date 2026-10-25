import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { normalizeAutoLayout } from "../../editor/scene_auto_layout.js";
import { CollapsibleSection, SectionAddButton } from "./property_section.jsx";

const DEFAULT_LAYOUT = {
  direction: "vertical",
  gap: 8,
  padding: 0,
  alignItems: "start",
  justifyContent: "start",
  widthMode: "fixed",
  heightMode: "hug",
};

const DISTRIBUTIONS = [
  "start",
  "center",
  "end",
  "space-between",
  "space-around",
  "space-evenly",
];

const FIELD_CLASS =
  "w-full min-w-0 rounded-lg bg-neutral-800 px-2 py-1.5 text-[11px] tabular-nums text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

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
  // Min/max are optional: clearing the field removes the constraint instead of
  // snapping it to 0, which is what a plain numeric input would do.
  const optionalField = (key, label, value, onChange) => (
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
        value={value === null ? "" : value}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const next = Number(raw);
          if (Number.isFinite(next)) onChange(Math.max(0, next));
        }}
      />
    </label>
  );
  const selectRow = (key, label, value, options, onChange) => (
    <label
      key={key}
      className="flex items-center justify-between gap-2 text-[10px] text-neutral-400"
    >
      <span>{label}</span>
      <select
        data-testid={`editor-auto-layout-${key}`}
        aria-label={label}
        className={FIELD_CLASS}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`editor.autoLayout.${option}`)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <CollapsibleSection
      title={t("editor.autoLayout.title")}
      storageKey="autoLayout.group"
      extra={
        <span data-testid="editor-auto-layout-enable">
          <SectionAddButton
            label={t("editor.autoLayout.enable")}
            onClick={() => editAndCommit({ autoLayout: DEFAULT_LAYOUT })}
          />
        </span>
      }
    >
      {!layout ? null : (
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
                    ? "bg-white/[0.12] text-white"
                    : "bg-white/[0.06] text-neutral-400"
                }`}
              >
                {t(`editor.autoLayout.${direction}`)}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-[10px] text-neutral-400">
            <span>{t("editor.autoLayout.wrap")}</span>
            <button
              type="button"
              data-testid="editor-auto-layout-wrap"
              aria-label={t("editor.autoLayout.wrap")}
              aria-pressed={layout.wrap}
              onClick={() => change({ wrap: !layout.wrap })}
              className={`rounded-lg px-3 py-1 text-[10px] ${
                layout.wrap
                  ? "bg-white/[0.12] text-white"
                  : "bg-white/[0.06] text-neutral-400"
              }`}
            >
              {layout.wrap
                ? t("editor.autoLayout.on")
                : t("editor.autoLayout.off")}
            </button>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {numericField(
              "gap",
              t("editor.autoLayout.gap"),
              layout.gap,
              (gap) => change({ gap }),
            )}
            {layout.wrap &&
              numericField(
                "crossGap",
                t("editor.autoLayout.crossGap"),
                layout.crossGap,
                (crossGap) => change({ crossGap }),
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
          {selectRow(
            "alignItems",
            t("editor.autoLayout.align"),
            layout.alignItems,
            ["start", "center", "end"],
            (alignItems) => change({ alignItems }),
          )}
          {selectRow(
            "justifyContent",
            t("editor.autoLayout.justify"),
            layout.justifyContent,
            DISTRIBUTIONS,
            (justifyContent) => change({ justifyContent }),
          )}
          {layout.wrap &&
            selectRow(
              "alignContent",
              t("editor.autoLayout.alignContent"),
              layout.alignContent,
              DISTRIBUTIONS,
              (alignContent) => change({ alignContent }),
            )}
          {["widthMode", "heightMode"].map((key) =>
            selectRow(
              key,
              t(`editor.autoLayout.${key}`),
              layout[key],
              ["fixed", "hug"],
              (mode) => change({ [key]: mode }),
            ),
          )}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-neutral-400">
              {t("editor.autoLayout.constraints")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {optionalField(
                "minWidth",
                t("editor.autoLayout.minWidth"),
                layout.minWidth,
                (minWidth) => change({ minWidth }),
              )}
              {optionalField(
                "maxWidth",
                t("editor.autoLayout.maxWidth"),
                layout.maxWidth,
                (maxWidth) => change({ maxWidth }),
              )}
              {optionalField(
                "minHeight",
                t("editor.autoLayout.minHeight"),
                layout.minHeight,
                (minHeight) => change({ minHeight }),
              )}
              {optionalField(
                "maxHeight",
                t("editor.autoLayout.maxHeight"),
                layout.maxHeight,
                (maxHeight) => change({ maxHeight }),
              )}
            </div>
          </div>
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
