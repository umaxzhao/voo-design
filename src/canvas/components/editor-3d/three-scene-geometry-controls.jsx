import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { commonValue, MIXED } from "../../editor/selection_values.js";

const INPUT_CLASS =
  "h-7 min-w-0 flex-1 rounded-xl bg-neutral-800 px-2 text-[11px] font-mono tabular-nums text-neutral-100 outline-none transition-colors hover:bg-neutral-800/80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";

export const GEOMETRY_TYPE_OPTIONS = [
  { value: "box", labelKey: "editor.three.box" },
  { value: "sphere", labelKey: "editor.three.sphere" },
  { value: "cylinder", labelKey: "editor.three.cylinder" },
  { value: "cone", labelKey: "editor.three.cone" },
  { value: "pyramid", labelKey: "editor.three.pyramid" },
  { value: "torus", labelKey: "editor.three.torus" },
  { value: "helix", labelKey: "editor.three.helix" },
  { value: "torusKnot", labelKey: "editor.three.torusKnot" },
  { value: "icosahedron", labelKey: "editor.three.icosahedron" },
  { value: "dodecahedron", labelKey: "editor.three.dodecahedron" },
  { value: "plane", labelKey: "editor.three.rect" },
  { value: "ellipse", labelKey: "editor.three.ellipse" },
  { value: "triangle", labelKey: "editor.three.triangle" },
  { value: "polygon", labelKey: "editor.three.polygon" },
  { value: "star", labelKey: "editor.three.star" },
];

function GeometryNumberField({
  label,
  value,
  min,
  max,
  step = 1,
  mixed = false,
  onChange,
  onCommit,
}) {
  const [draft, setDraft] = useState(mixed ? "" : String(value ?? ""));
  useEffect(() => {
    setDraft(mixed ? "" : String(value ?? ""));
  }, [value, mixed]);

  return (
    <label className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400">
      <span className="w-24 shrink-0 truncate">{label}</span>
      <input
        type="number"
        aria-label={label}
        placeholder={mixed ? "—" : undefined}
        className={INPUT_CLASS}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const number = Number(nextDraft);
          if (
            nextDraft !== "" &&
            Number.isFinite(number) &&
            (min === undefined || number >= min) &&
            (max === undefined || number <= max)
          ) {
            onChange(number);
          }
        }}
        onBlur={() => {
          setDraft(mixed ? "" : String(value ?? ""));
          onCommit?.();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

GeometryNumberField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
  min: PropTypes.number,
  max: PropTypes.number,
  step: PropTypes.number,
  mixed: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func,
};

/**
 * Modular geometry parameters inspector for 3D primitives and planar shapes.
 * Operates in both single-node and multi-selection mode.
 */
export default function ThreeGeometryControls({
  node = null,
  nodes = null,
  isMulti = false,
  onPatchNode,
  onCommit,
  t,
}) {
  const effectiveNodes = isMulti && Array.isArray(nodes) ? nodes : node ? [node] : [];
  if (effectiveNodes.length === 0) return null;

  const isMultiMode = effectiveNodes.length > 1;
  const allMesh = effectiveNodes.every((n) => n.kind === "mesh3d");
  if (!allMesh) return null;

  const firstType = effectiveNodes[0].geometry?.type ?? "box";
  const sharedGeometryType = effectiveNodes.every(
    (n) => (n.geometry?.type ?? "box") === firstType,
  )
    ? firstType
    : null;

  if (isMultiMode && !sharedGeometryType) return null;

  const activeType = sharedGeometryType ?? firstType;

  const getParam = (field, fallback) => {
    if (!isMultiMode) {
      return {
        value: effectiveNodes[0].geometry?.[field] ?? fallback,
        mixed: false,
      };
    }
    const common = commonValue(
      effectiveNodes.map((n) => ({
        [field]: n.geometry?.[field] ?? fallback,
      })),
      field,
    );
    return {
      value: common === MIXED ? fallback : common,
      mixed: common === MIXED,
    };
  };

  const patchField = (field, val) => {
    for (const n of effectiveNodes) {
      onPatchNode?.(
        n.id,
        { geometry: { ...(n.geometry ?? {}), [field]: val } },
        { commit: false },
      );
    }
  };

  const changeType = (newType) => {
    for (const n of effectiveNodes) {
      onPatchNode?.(
        n.id,
        { geometry: { ...(n.geometry ?? {}), type: newType } },
        { commit: false },
      );
    }
    onCommit?.();
  };

  // Resolve fields for current geometry type
  const depthParam = getParam("depth", 80);
  const radialParam = getParam("radialSegments", 32);
  const tubularParam = getParam("tubularSegments", 48);
  const tubeRadiusParam = getParam("tubeRadius", 16);
  const turnsParam = getParam("turns", 3);
  const pitchParam = getParam("pitch", 25);
  const pParam = getParam("p", 2);
  const qParam = getParam("q", 3);
  const detailParam = getParam("detail", 0);
  const sidesParam = getParam("sides", 5);
  const pointsParam = getParam("points", 5);
  const innerRatioParam = getParam("innerRatio", 0.5);

  return (
    <div
      data-testid="editor-three-geometry-controls"
      className="flex flex-col gap-2 font-mono"
    >
      <label className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400">
        <span className="w-24 shrink-0">{t("editor.three.geometry")}</span>
        <select
          aria-label={t("editor.three.geometry")}
          className={INPUT_CLASS}
          value={activeType}
          onChange={(e) => changeType(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {GEOMETRY_TYPE_OPTIONS.map(({ value, labelKey }) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
      </label>

      {/* Box */}
      {activeType === "box" ? (
        <GeometryNumberField
          label={t("editor.three.depth")}
          value={depthParam.value}
          mixed={depthParam.mixed}
          min={1}
          onChange={(v) => patchField("depth", v)}
          onCommit={onCommit}
        />
      ) : null}

      {/* Sphere */}
      {activeType === "sphere" ? (
        <GeometryNumberField
          label={t("editor.three.radialSegments")}
          value={radialParam.value}
          mixed={radialParam.mixed}
          min={6}
          max={128}
          onChange={(v) => patchField("radialSegments", v)}
          onCommit={onCommit}
        />
      ) : null}

      {/* Cylinder */}
      {activeType === "cylinder" ? (
        <>
          <GeometryNumberField
            label={t("editor.three.depth")}
            value={depthParam.value}
            mixed={depthParam.mixed}
            min={1}
            onChange={(v) => patchField("depth", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.radialSegments")}
            value={radialParam.value}
            mixed={radialParam.mixed}
            min={6}
            max={128}
            onChange={(v) => patchField("radialSegments", v)}
            onCommit={onCommit}
          />
        </>
      ) : null}

      {/* Cone */}
      {activeType === "cone" ? (
        <>
          <GeometryNumberField
            label={t("editor.three.depth")}
            value={depthParam.value}
            mixed={depthParam.mixed}
            min={1}
            onChange={(v) => patchField("depth", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.radialSegments")}
            value={radialParam.value}
            mixed={radialParam.mixed}
            min={6}
            max={128}
            onChange={(v) => patchField("radialSegments", v)}
            onCommit={onCommit}
          />
        </>
      ) : null}

      {/* Pyramid */}
      {activeType === "pyramid" ? (
        <GeometryNumberField
          label={t("editor.three.depth")}
          value={depthParam.value}
          mixed={depthParam.mixed}
          min={1}
          onChange={(v) => patchField("depth", v)}
          onCommit={onCommit}
        />
      ) : null}

      {/* Torus */}
      {activeType === "torus" ? (
        <>
          <GeometryNumberField
            label={t("editor.three.tubeRadius")}
            value={tubeRadiusParam.value}
            mixed={tubeRadiusParam.mixed}
            min={1}
            max={100}
            onChange={(v) => patchField("tubeRadius", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.radialSegments")}
            value={radialParam.value}
            mixed={radialParam.mixed}
            min={6}
            max={64}
            onChange={(v) => patchField("radialSegments", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.tubularSegments")}
            value={tubularParam.value}
            mixed={tubularParam.mixed}
            min={8}
            max={128}
            onChange={(v) => patchField("tubularSegments", v)}
            onCommit={onCommit}
          />
        </>
      ) : null}

      {/* Helix */}
      {activeType === "helix" ? (
        <>
          <GeometryNumberField
            label={t("editor.three.depth")}
            value={depthParam.value}
            mixed={depthParam.mixed}
            min={1}
            onChange={(v) => patchField("depth", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.turns")}
            value={turnsParam.value}
            mixed={turnsParam.mixed}
            min={1}
            max={20}
            onChange={(v) => patchField("turns", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.pitch")}
            value={pitchParam.value}
            mixed={pitchParam.mixed}
            min={5}
            max={100}
            onChange={(v) => patchField("pitch", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.tubeRadius")}
            value={tubeRadiusParam.value}
            mixed={tubeRadiusParam.mixed}
            min={1}
            max={30}
            onChange={(v) => patchField("tubeRadius", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.radialSegments")}
            value={radialParam.value}
            mixed={radialParam.mixed}
            min={4}
            max={32}
            onChange={(v) => patchField("radialSegments", v)}
            onCommit={onCommit}
          />
        </>
      ) : null}

      {/* Torus Knot */}
      {activeType === "torusKnot" ? (
        <>
          <GeometryNumberField
            label={t("editor.three.p")}
            value={pParam.value}
            mixed={pParam.mixed}
            min={1}
            max={16}
            onChange={(v) => patchField("p", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.q")}
            value={qParam.value}
            mixed={qParam.mixed}
            min={1}
            max={16}
            onChange={(v) => patchField("q", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.tubeRadius")}
            value={tubeRadiusParam.value}
            mixed={tubeRadiusParam.mixed}
            min={1}
            max={40}
            onChange={(v) => patchField("tubeRadius", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.radialSegments")}
            value={radialParam.value}
            mixed={radialParam.mixed}
            min={4}
            max={32}
            onChange={(v) => patchField("radialSegments", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.tubularSegments")}
            value={tubularParam.value}
            mixed={tubularParam.mixed}
            min={16}
            max={256}
            onChange={(v) => patchField("tubularSegments", v)}
            onCommit={onCommit}
          />
        </>
      ) : null}

      {/* Icosahedron / Dodecahedron */}
      {activeType === "icosahedron" || activeType === "dodecahedron" ? (
        <GeometryNumberField
          label={t("editor.three.detail")}
          value={detailParam.value}
          mixed={detailParam.mixed}
          min={0}
          max={4}
          onChange={(v) => patchField("detail", v)}
          onCommit={onCommit}
        />
      ) : null}

      {/* Polygon */}
      {activeType === "polygon" ? (
        <GeometryNumberField
          label={t("editor.three.sides")}
          value={sidesParam.value}
          mixed={sidesParam.mixed}
          min={3}
          max={32}
          onChange={(v) => patchField("sides", v)}
          onCommit={onCommit}
        />
      ) : null}

      {/* Star */}
      {activeType === "star" ? (
        <>
          <GeometryNumberField
            label={t("editor.three.points")}
            value={pointsParam.value}
            mixed={pointsParam.mixed}
            min={3}
            max={32}
            onChange={(v) => patchField("points", v)}
            onCommit={onCommit}
          />
          <GeometryNumberField
            label={t("editor.three.innerRatio")}
            value={innerRatioParam.value}
            mixed={innerRatioParam.mixed}
            min={0.1}
            max={0.9}
            step={0.05}
            onChange={(v) => patchField("innerRatio", v)}
            onCommit={onCommit}
          />
        </>
      ) : null}
    </div>
  );
}

ThreeGeometryControls.propTypes = {
  node: PropTypes.object,
  nodes: PropTypes.arrayOf(PropTypes.object),
  isMulti: PropTypes.bool,
  onPatchNode: PropTypes.func,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};
