import PropTypes from "prop-types";
import { useRef, useState } from "react";
import InfoHint from "../info_hint.jsx";
import { ICON_STROKE_WIDTH, IconAdd, IconBox3 } from "../../icons.jsx";
import {
  changeMaterialLayerType,
  DEFAULT_MATERIAL_COLOR,
  MAX_MATERIAL_LAYERS,
  createMaterialAsset,
  createMaterialLayer,
  normalizeMaterialAssets,
  resolveMaterialAsset,
} from "../../editor/three-scene-materials.js";
import { InspectorGroup } from "./three-inspector.jsx";
import {
  ICON_BUTTON_CLASS,
  LayerAction,
  MaterialLayerRow,
} from "./three-material-layer-row.jsx";
import { ThreeMaterialTypePicker } from "./three-material-type-picker.jsx";

const SELECT_CLASS =
  "h-7 min-w-0 flex-1 rounded-xl bg-neutral-800 px-2 text-[11px] text-neutral-100 outline-none transition-colors hover:bg-neutral-800/80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";

/**
 * Keydown for the asset name field. While an IME composition is open the
 * Enter that accepts it must leave the field alone — otherwise the rename
 * commits under the candidate window and the composition collapses. Every
 * other key still stays out of the editor's own shortcuts.
 *
 * @returns {boolean} whether the field blurred to commit the name
 */
export function handleAssetNameKeyDown(event) {
  if (event.isComposing || event.keyCode === 229) return false;
  event.stopPropagation();
  if (event.key === "Enter") {
    event.currentTarget.blur();
    return true;
  }
  return false;
}

export function ThreeMaterialEditor({
  doc,
  node = null,
  onPatchScene,
  onPatchNode = null,
  onCommit = null,
  children = null,
  t,
}) {
  const assets = normalizeMaterialAssets(doc.scene3d?.materialAssets);
  const [sceneAssetId, setSceneAssetId] = useState(null);
  const [expandedLayerId, setExpandedLayerId] = useState(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const addLayerButtonRef = useRef(null);
  const asset = node
    ? assets.find((entry) => entry.id === node.materialAssetId)
    : (assets.find((entry) => entry.id === sceneAssetId) ?? assets[0]);
  const activeLayerId =
    asset?.layers.find((layer) => layer.id === expandedLayerId)?.id ??
    asset?.layers[asset.layers.length - 1]?.id;
  const previewColor = [...(asset?.layers ?? [])]
    .reverse()
    .find((layer) => layer.enabled)?.color;
  const assignedCount = asset
    ? (doc.nodes ?? []).filter(
        (entry) =>
          ["mesh3d", "model3d"].includes(entry.kind) &&
          entry.materialAssetId === asset.id,
      ).length
    : 0;
  const patchAsset = (nextAsset) => {
    onPatchScene?.({
      materialAssets: assets.map((entry) =>
        entry.id === nextAsset.id ? nextAsset : entry,
      ),
    });
  };
  const patchLayer = (id, patch) => {
    if (!asset) return;
    patchAsset({
      ...asset,
      layers: asset.layers.map((layer) =>
        layer.id === id
          ? patch.type && patch.type !== layer.type
            ? // A type change adopts the new defaults and clamps fields the
              // old type left out of the new bounds; the stale values would
              // otherwise make the document overload on save.
              changeMaterialLayerType(layer, patch.type)
            : { ...layer, ...patch }
          : layer,
      ),
    });
  };
  const createAsset = () => {
    const resolvedColor =
      node && resolveMaterialAsset(doc, node).layers[0]?.color;
    const baseColor = /^#[\da-fA-F]{6}$/.test(resolvedColor ?? "")
      ? resolvedColor
      : DEFAULT_MATERIAL_COLOR;
    const nextAsset = createMaterialAsset(
      t("editor.three.newMaterial", { number: assets.length + 1 }),
      baseColor,
    );
    onPatchScene?.({ materialAssets: [...assets, nextAsset] });
    if (node) onPatchNode?.(node.id, { materialAssetId: nextAsset.id });
    setSceneAssetId(nextAsset.id);
    setExpandedLayerId(nextAsset.layers[0].id);
    onCommit?.();
  };
  const addLayer = (type) => {
    if (!asset || asset.layers.length >= MAX_MATERIAL_LAYERS) return;
    const layer = createMaterialLayer(type);
    patchAsset({ ...asset, layers: [...asset.layers, layer] });
    setExpandedLayerId(layer.id);
    setTypePickerOpen(false);
    onCommit?.();
  };
  // Saved layers composite bottom-to-top; the list presents the top layer first.
  const moveLayer = (displayIndex, direction) => {
    if (!asset) return;
    const index = asset.layers.length - 1 - displayIndex;
    const target = index - direction;
    if (target < 0 || target >= asset.layers.length) return;
    const layers = [...asset.layers];
    [layers[index], layers[target]] = [layers[target], layers[index]];
    patchAsset({ ...asset, layers });
    onCommit?.();
  };
  const removeLayer = (id) => {
    if (!asset || asset.layers.length <= 1) return;
    patchAsset({
      ...asset,
      layers: asset.layers.filter((layer) => layer.id !== id),
    });
    onCommit?.();
  };

  return (
    <InspectorGroup
      icon={IconBox3}
      title={t(node ? "editor.three.material" : "editor.three.materialAssets")}
      defaultOpen={false}
      testId="editor-three-material-assets"
      extra={
        <>
          {node ? (
            <span
              data-testid="editor-three-current-material"
              className="max-w-32 truncate text-[10px] text-neutral-400"
              title={asset?.name ?? t("editor.three.basicMaterial")}
            >
              {asset?.name ?? t("editor.three.basicMaterial")}
            </span>
          ) : null}
          <LayerAction
            icon={IconAdd}
            label={t("editor.three.createMaterial")}
            onClick={createAsset}
            testId="editor-three-material-create"
          />
        </>
      }
    >
      <div className="flex min-w-0 items-center gap-2">
        {previewColor ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 rounded-md"
            style={{ backgroundColor: previewColor }}
          />
        ) : null}
        <select
          data-testid="editor-three-material-select"
          aria-label={t("editor.three.materialAssets")}
          className={SELECT_CLASS}
          value={asset?.id ?? ""}
          onChange={(event) => {
            const id = event.target.value;
            if (node) {
              onPatchNode?.(node.id, { materialAssetId: id || null });
              onCommit?.();
            } else setSceneAssetId(id);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {node || assets.length === 0 ? (
            <option value="">
              {t(
                node
                  ? "editor.three.basicMaterial"
                  : "editor.three.noMaterials",
              )}
            </option>
          ) : null}
          {assets.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>
      {children}
      {asset ? (
        <>
          <div
            data-testid="editor-three-material-scope"
            className="text-[10px] text-neutral-400"
          >
            <InfoHint
              label={t("editor.three.materialUsedBy", {
                count: assignedCount,
              })}
              text={t("editor.three.materialSharedHint")}
            />
          </div>
          <label className="flex min-w-0 items-center gap-2 text-[11px] text-neutral-400">
            <span className="w-20 shrink-0">{t("editor.three.assetName")}</span>
            <input
              key={`${asset.id}:${asset.name}`}
              type="text"
              aria-label={t("editor.three.assetName")}
              className={SELECT_CLASS}
              defaultValue={asset.name}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== asset.name) {
                  patchAsset({ ...asset, name });
                  onCommit?.();
                } else event.target.value = asset.name;
              }}
              onKeyDown={handleAssetNameKeyDown}
            />
          </label>
          <ul className="flex flex-col gap-1.5">
            {[...asset.layers].reverse().map((layer, index) => (
              <MaterialLayerRow
                key={layer.id}
                layer={layer}
                index={index}
                count={asset.layers.length}
                expanded={activeLayerId === layer.id}
                onExpand={() => setExpandedLayerId(layer.id)}
                onChange={(patch) => patchLayer(layer.id, patch)}
                onMove={(direction) => moveLayer(index, direction)}
                onRemove={() => removeLayer(layer.id)}
                onCommit={onCommit}
                t={t}
              />
            ))}
          </ul>
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 text-[11px] text-neutral-400">
              {t("editor.three.addLayer")}
            </span>
            <button
              ref={addLayerButtonRef}
              type="button"
              data-testid="editor-three-material-layer-add"
              aria-label={t("editor.three.addLayer")}
              title={t("editor.three.addLayer")}
              className={ICON_BUTTON_CLASS}
              disabled={asset.layers.length >= MAX_MATERIAL_LAYERS}
              onClick={() => setTypePickerOpen(true)}
            >
              <IconAdd size={13} strokeWidth={ICON_STROKE_WIDTH} />
            </button>
          </div>
          {asset.layers.length >= MAX_MATERIAL_LAYERS ? (
            <p className="text-[10px] text-neutral-400">
              {t("editor.three.layerLimit", { count: MAX_MATERIAL_LAYERS })}
            </p>
          ) : null}
        </>
      ) : null}
      {typePickerOpen ? (
        <ThreeMaterialTypePicker
          anchorRef={addLayerButtonRef}
          onChoose={addLayer}
          onClose={() => setTypePickerOpen(false)}
          t={t}
        />
      ) : null}
    </InspectorGroup>
  );
}

ThreeMaterialEditor.propTypes = {
  doc: PropTypes.object.isRequired,
  node: PropTypes.object,
  onPatchScene: PropTypes.func,
  onPatchNode: PropTypes.func,
  onCommit: PropTypes.func,
  children: PropTypes.node,
  t: PropTypes.func.isRequired,
};
