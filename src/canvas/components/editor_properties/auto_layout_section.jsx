import {
  Columns2,
  Rows2,
  BetweenHorizontalStart,
  CornerDownLeft,
} from "lucide-react";
import PropTypes from "prop-types";
import LayoutNumberInput from "./layout_number_input.jsx";
import AutoLayoutAdvancedSettings from "./auto_layout_advanced_settings.jsx";
import { useI18n } from "../../use_i18n.js";
import { normalizeAutoLayout } from "../../editor/scene_auto_layout.js";
import {
  SectionAddButton,
  SectionEmptyRow,
  StaticSection,
} from "./property_section.jsx";
import CustomSelect from "../custom_select.jsx";
import { DEFAULT_AUTO_LAYOUT, DISTRIBUTIONS, alignmentPatch } from "./auto_layout_controls.js";
export { DEFAULT_AUTO_LAYOUT, alignmentPatch } from "./auto_layout_controls.js";

const FIELD_CLASS =
  "w-full min-w-0 rounded-lg bg-neutral-800 px-2 py-1.5 text-[11px] tabular-nums text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

export function AutoLayoutFields({
  object,
  editAndCommit,
  hideDirection = false,
  hideSizing = false,
}) {
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
      <LayoutNumberInput optional className={FIELD_CLASS} aria-label={label}
        value={value} onChange={onChange} />
    </label>
  );
  const selectRow = (key, label, value, options, onChange) => (
    <label
      key={key}
      className="flex items-center justify-between gap-2 text-[10px] text-neutral-400"
    >
      <span>{label}</span>
      <CustomSelect
        data-testid={`editor-auto-layout-${key}`}
        aria-label={label}
        rootClassName="min-w-0 flex-1"
        className={FIELD_CLASS}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`editor.autoLayout.${option}`)}
          </option>
        ))}
      </CustomSelect>
    </label>
  );

  if (!layout)
    return (
      <SectionEmptyRow
        label={t("editor.autoLayout.enable")}
        testId="editor-auto-layout-empty"
        onClick={() => editAndCommit({ autoLayout: DEFAULT_AUTO_LAYOUT })}
      />
    );
  const horizontal = layout.direction === "horizontal";
  const positions = ["start", "center", "end"];
  const pairedPadding = (axis, first, second, Icon) => (
    <label
      className="flex h-7 min-w-0 items-center gap-2 rounded-xl bg-neutral-800 px-2"
      title={t(`editor.autoLayout.padding${axis}`)}
    >
      <Icon
        size={14}
        className="shrink-0 text-neutral-400"
        aria-hidden="true"
      />
      <input
        type="number"
        min="0"
        step="1"
        aria-label={t(`editor.autoLayout.padding${axis}`)}
        placeholder={t("editor.autoLayout.mixed")}
        className="w-full min-w-0 bg-transparent text-[11px] text-neutral-100 outline-none"
        value={
          layout.padding[first] === layout.padding[second]
            ? layout.padding[first]
            : ""
        }
        onChange={(event) => {
          if (event.target.value === "") return;
          const value = Number(event.target.value);
          if (Number.isFinite(value))
            change({
              padding: {
                ...layout.padding,
                [first]: Math.max(0, value),
                [second]: Math.max(0, value),
              },
            });
        }}
      />
    </label>
  );

  return (
    <div className="space-y-2">
      {!hideDirection && (
        <div className="flex gap-1">
          {["vertical", "horizontal"].map((direction) => (
            <button
              key={direction}
              type="button"
              aria-pressed={layout.direction === direction}
              onClick={() => change({ direction })}
              className="flex-1 rounded-lg bg-neutral-800 p-1 text-[11px]"
            >
              {t(`editor.autoLayout.${direction}`)}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div
          role="group"
          aria-label={t("editor.autoLayout.align")}
          className="grid h-16 grid-cols-3 grid-rows-3 rounded-xl bg-neutral-800 p-1"
        >
          {positions.flatMap((row, y) =>
            positions.map((column, x) => {
              // Horizontal layout packs along X; vertical layout packs along Y.
              const patch = alignmentPatch(layout.direction, x, y);
              const selected =
                layout.alignItems === patch.alignItems &&
                layout.justifyContent === patch.justifyContent;
              return (
                <button
                  key={`${row}-${column}`}
                  type="button"
                  aria-label={t("editor.autoLayout.alignmentPoint", {
                    row: t(`editor.autoLayout.${row}`),
                    column: t(`editor.autoLayout.${column}`),
                  })}
                  aria-pressed={selected}
                  onClick={() => change(patch)}
                  className="flex items-center justify-center rounded-lg hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
                >
                  {selected ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      className="text-[#a7ffd4]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path
                        d={
                          horizontal
                            ? "M3 3v10M8 3v6M13 3v8"
                            : "M3 3h10M3 8h6M3 13h8"
                        }
                      />
                    </svg>
                  ) : (
                    <span className="size-1 rounded-full bg-neutral-500" />
                  )}
                </button>
              );
            }),
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <label
            className="flex h-7 items-center gap-2 rounded-xl bg-neutral-800 px-2"
            title={t("editor.autoLayout.gap")}
          >
            <BetweenHorizontalStart
              size={14}
              className="shrink-0 text-neutral-400"
              aria-hidden="true"
            />
            <input
              type="number"
              min="0"
              step="1"
              aria-label={t("editor.autoLayout.gap")}
              value={layout.gap}
              className="w-full min-w-0 bg-transparent text-[11px] text-neutral-100 outline-none"
              onChange={(event) => {
                if (event.target.value === "") return;
                const gap = Number(event.target.value);
                if (Number.isFinite(gap)) change({ gap: Math.max(0, gap) });
              }}
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              data-testid="editor-auto-layout-wrap"
              title={t("editor.autoLayout.wrap")}
              aria-label={t("editor.autoLayout.wrap")}
              aria-pressed={layout.wrap}
              onClick={() => change({ wrap: !layout.wrap })}
              className={`flex size-7 items-center justify-center rounded-lg hover:bg-white/[0.06] ${layout.wrap ? "text-[#a7ffd4]" : "text-neutral-400"}`}
            >
              <CornerDownLeft size={14} />
            </button>
            <AutoLayoutAdvancedSettings>
                {selectRow(
                  "justifyContent",
                  t("editor.autoLayout.justify"),
                  layout.justifyContent,
                  DISTRIBUTIONS,
                  (justifyContent) => change({ justifyContent }),
                )}
                {selectRow(
                  "alignItems",
                  t("editor.autoLayout.align"),
                  layout.alignItems,
                  ["start", "center", "end", "stretch"],
                  (alignItems) => change({ alignItems }),
                )}
                {layout.wrap && (
                  <>
                    {numericField(
                      "crossGap",
                      t("editor.autoLayout.crossGap"),
                      layout.crossGap,
                      (crossGap) => change({ crossGap }),
                    )}
                    {selectRow(
                      "alignContent",
                      t("editor.autoLayout.alignContent"),
                      layout.alignContent,
                      DISTRIBUTIONS,
                      (alignContent) => change({ alignContent }),
                    )}
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {["top", "right", "bottom", "left"].map((side) =>
                    numericField(
                      side,
                      t(
                        `editor.autoLayout.padding${side[0].toUpperCase()}${side.slice(1)}`,
                      ),
                      layout.padding[side],
                      (value) =>
                        change({
                          padding: { ...layout.padding, [side]: value },
                        }),
                    ),
                  )}
                </div>
                <div className="text-[10px] text-neutral-400">
                  {t("editor.autoLayout.constraints")}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {["minWidth", "maxWidth", "minHeight", "maxHeight"].map(
                    (key) =>
                      optionalField(
                        key,
                        t(`editor.autoLayout.${key}`),
                        layout[key],
                        (value) => change({ [key]: value }),
                      ),
                  )}
                </div>
            </AutoLayoutAdvancedSettings>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {pairedPadding("Horizontal", "left", "right", Columns2)}
        {pairedPadding("Vertical", "top", "bottom", Rows2)}
      </div>
      {!hideSizing &&
        ["widthMode", "heightMode"].map((key) =>
          selectRow(
            key,
            t(`editor.autoLayout.${key}`),
            layout[key],
            ["fixed", "hug"],
            (mode) => change({ [key]: mode }),
          ),
        )}
    </div>
  );
}

/** Standalone group (kept for callers that show it outside the layout group). */
export default function AutoLayoutSection({ object, editAndCommit }) {
  const { t } = useI18n();
  const layout = normalizeAutoLayout(object.autoLayout);
  const enable = () => editAndCommit({ autoLayout: DEFAULT_AUTO_LAYOUT });
  return (
    <StaticSection
      title={t("editor.autoLayout.title")}
      storageKey="autoLayout.group"
      extra={
        <SectionAddButton
          label={t("editor.autoLayout.enable")}
          onClick={enable}
        />
      }
    >
      {layout ? (
        <AutoLayoutFields object={object} editAndCommit={editAndCommit} />
      ) : (
        <SectionEmptyRow
          label={t("editor.autoLayout.enable")}
          testId="editor-auto-layout-empty"
          onClick={enable}
        />
      )}
    </StaticSection>
  );
}

AutoLayoutSection.propTypes = {
  object: PropTypes.object.isRequired,
  editAndCommit: PropTypes.func.isRequired,
};
