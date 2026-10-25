/** Export section: preset rows (format · scale · suffix) and one Export action. */

import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { StaticSection, SectionAddButton, fieldClass } from "./property_section.jsx";
import FlatSelect from "../flat_select.jsx";
import { IconDownload } from "../../icons.jsx";

const FORMATS = [
  { value: "image/png", labelKey: "editor.exportPng", ext: "png" },
  { value: "image/jpeg", labelKey: "editor.exportJpeg", ext: "jpg" },
  { value: "image/webp", labelKey: "editor.exportWebp", ext: "webp" },
];
const SCALES = [1, 2, 3];
const MAX_PRESETS = 4;

let presetSeq = 0;
const makePreset = () => ({
  id: `preset-${++presetSeq}`,
  type: "image/png",
  scale: 1,
  suffix: "",
});

function download(dataUrl, filename) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

export default function ExportSection({ object, selectedNodes = [], engine }) {
  const { t } = useI18n();
  const [presets, setPresets] = useState(() => [makePreset()]);
  if (!engine?.exportSelectionPng) return null;

  const ids = selectedNodes.length
    ? selectedNodes.map((node) => node.id)
    : object?.id
      ? [object.id]
      : [];

  const patch = (id, changes) =>
    setPresets((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    );

  const exportPreset = (preset) => {
    if (!ids.length) return;
    const result = engine.exportSelectionPng(ids, {
      scale: preset.scale,
      type: preset.type,
      ...(preset.type === "image/jpeg" ? { quality: 0.92 } : {}),
    });
    const dataUrl = typeof result === "string" ? result : result?.dataUrl;
    if (!dataUrl) return;
    const format = FORMATS.find((entry) => entry.value === preset.type);
    const base = (object?.name || "export").trim() || "export";
    const suffix = preset.suffix ? `-${preset.suffix.trim()}` : "";
    download(dataUrl, `${base}${suffix}@${preset.scale}x.${format?.ext ?? "png"}`);
  };

  return (
    <StaticSection
      title={t("editor.props.exportTitle")}
      storageKey="export"
      extra={
        presets.length < MAX_PRESETS ? (
          <SectionAddButton
            label={t("editor.props.addExportSettings")}
            onClick={() => setPresets((rows) => [...rows, makePreset()])}
          />
        ) : null
      }
    >
      <div className="flex flex-col gap-1.5">
        {presets.map((preset) => (
          <div key={preset.id} className="flex min-h-7 items-center gap-1.5">
            <FlatSelect
              value={preset.type}
              onChange={(type) => patch(preset.id, { type })}
              label={t("editor.props.exportFormat")}
              options={FORMATS.map((format) => ({
                value: format.value,
                label: t(format.labelKey),
              }))}
              className="min-w-0 flex-1"
              triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2 !text-[10px] !font-mono !text-neutral-100 hover:!bg-neutral-800/80"
              widthClass="w-40"
            />
            <FlatSelect
              value={String(preset.scale)}
              onChange={(value) => patch(preset.id, { scale: Number(value) })}
              label={t("editor.exportScale")}
              options={SCALES.map((scale) => ({
                value: String(scale),
                label: `${scale}x`,
              }))}
              className="w-[58px] shrink-0"
              triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2 !text-[10px] !font-mono !text-neutral-100 hover:!bg-neutral-800/80"
              widthClass="w-24"
            />
            <input
              value={preset.suffix}
              onChange={(event) =>
                patch(preset.id, { suffix: event.target.value })
              }
              placeholder={t("editor.props.exportSuffix")}
              aria-label={t("editor.props.exportSuffix")}
              className={`${fieldClass} !w-[64px] shrink-0 !px-2 !text-[10px]`}
            />
            <button
              type="button"
              aria-label={t("editor.props.removeExportSettings")}
              title={t("editor.props.removeExportSettings")}
              disabled={presets.length <= 1}
              onClick={() =>
                setPresets((rows) => rows.filter((row) => row.id !== preset.id))
              }
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => presets.forEach(exportPreset)}
          className="flex min-h-7 w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.08] text-[11px] font-mono text-neutral-100 transition-colors hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        >
          <IconDownload size={12} />
          {t("editor.export")}
        </button>
      </div>
    </StaticSection>
  );
}

ExportSection.propTypes = {
  object: PropTypes.object.isRequired,
  selectedNodes: PropTypes.array,
  engine: PropTypes.object,
};
