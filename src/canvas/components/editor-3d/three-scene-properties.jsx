import PropTypes from "prop-types";
import { useRef, useState } from "react";
import {
  getNodeSpatial,
  normalizeScene3d,
} from "../../editor/canvas-composition-model.js";
import { normalizeTimeline } from "../../editor/scene-motion.js";
import { normalizeColorVariables } from "../../editor/scene_color_variables.js";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { useI18n } from "../../use_i18n.js";
import {
  IconBox3,
  IconCamera,
  IconImage,
  IconLayers,
  IconMove,
  IconPalette,
  IconSliders,
  IconVideo,
} from "../../icons.jsx";
import { MotionFieldProvider } from "../editor_motion/motion-field-context.jsx";
import {
  AssetRow,
  ColorRow,
  EmptyAssets,
  InspectorGroup,
  InspectorRow,
  InspectorSwitch,
  SegmentedControl,
} from "./three-inspector.jsx";
import { ColorField, NumberField } from "./three-scene-fields.jsx";
import { ThreeMaterialEditor } from "./three-material-editor.jsx";
import { ThreeSceneAppearance } from "./three-scene-appearance.jsx";
import { ThreeSceneFrame } from "./three-scene-frame.jsx";
import ThreeSceneEffects from "./three-scene-effects.jsx";
import { ThreeSceneLighting } from "./three-scene-lighting.jsx";
import ThreeMotionNumberField from "./three-motion-number-field.jsx";
import ThreeModifiersGroup from "./three-modifiers-group.jsx";
import ThreeNodeStates from "./three-node-states.jsx";
import ThreeGeometryControls from "./three-scene-geometry-controls.jsx";
import LinearArraySection from "../editor_properties/linear_array_section.jsx";
import GridArraySection from "../editor_properties/grid_array_section.jsx";
import CircularArraySection from "../editor_properties/circular_array_section.jsx";
import VectorRow from "./three-vector-row.jsx";

export function sceneBackgroundForTransparencyToggle(
  checked,
  lastOpaqueBackground,
  pageBackground,
  storedBackground = null,
) {
  return checked
    ? "transparent"
    : (storedBackground ?? lastOpaqueBackground ?? pageBackground);
}

function SceneFields({ doc, engine, onPatchScene, onCommit, t }) {
  const scene = normalizeScene3d(doc.scene3d, doc.width, doc.height);
  const camera = scene.camera;
  const patchCamera = (patch) => onPatchScene?.({ camera: patch });
  const patchCameraPoint = (field, axis, value) =>
    patchCamera({ [field]: { [axis]: value } });
  const patchLighting = (patch) => onPatchScene?.({ lighting: patch });
  const patchAppearance = (patch) => onPatchScene?.(patch);
  const transparent = scene.backgroundColor === "transparent";
  const lastOpaqueBackground = useRef(
    /^#[0-9a-fA-F]{6}$/.test(scene.backgroundColorBeforeTransparency)
      ? scene.backgroundColorBeforeTransparency
      : /^#[0-9a-fA-F]{6}$/.test(scene.backgroundColor)
        ? scene.backgroundColor
        : null,
  );
  if (!transparent && /^#[0-9a-fA-F]{6}$/.test(scene.backgroundColor)) {
    lastOpaqueBackground.current = scene.backgroundColor;
  }
  // What shows through a transparent scene: the frame's own page colour.
  const pageBackground = /^#[0-9a-fA-F]{6}$/.test(doc.backgroundColor ?? "")
    ? doc.backgroundColor
    : "#ffffff";
  const colorVariables = normalizeColorVariables(doc.colorVariables);
  const nodeLabel = (node) => node.name || t("editor.three.object");
  const imageNodes = (doc.nodes ?? []).filter((node) => node.kind === "image");
  const mediaNodes = (doc.nodes ?? []).filter((node) =>
    ["video", "model3d", "canvasInstance"].includes(node.kind),
  );
  const selectNode = (id) => engine?.selectExactly?.([id]);

  return (
    <>
      <ThreeSceneFrame
        width={doc.width}
        height={doc.height}
        autoZoom={scene.frame.autoZoom}
        cameraPreview={scene.frame.cameraPreview ?? false}
        onAutoZoomChange={(autoZoom) => onPatchScene?.({ frame: { autoZoom } })}
        onCameraPreviewChange={(cameraPreview) =>
          onPatchScene?.({ frame: { cameraPreview } })
        }
        onCommit={onCommit}
        t={t}
      />
      <InspectorGroup
        icon={IconLayers}
        title={t("editor.three.scene")}
        testId="editor-three-scene-group"
      >
        <ColorRow
          label={t("editor.three.background")}
          value={transparent ? pageBackground : scene.backgroundColor}
          unsetLabel={transparent ? t("editor.three.transparent") : null}
          onChange={(backgroundColor) =>
            onPatchScene?.({
              backgroundColor,
              ...(transparent
                ? {}
                : { backgroundColorBeforeTransparency: backgroundColor }),
            })
          }
          onCommit={onCommit}
        />
        <div data-testid="editor-three-background-opacity">
          <NumberField
            label={t("editor.three.backgroundOpacity")}
            value={scene.backgroundOpacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(backgroundOpacity) =>
              onPatchScene?.({ backgroundOpacity })
            }
            onCommit={onCommit}
          />
        </div>
        <InspectorRow label={t("editor.three.transparent")}>
          <InspectorSwitch
            checked={transparent}
            label={t("editor.three.transparent")}
            onChange={(checked) => {
              onPatchScene?.({
                backgroundColor: sceneBackgroundForTransparencyToggle(
                  checked,
                  lastOpaqueBackground.current,
                  pageBackground,
                  scene.backgroundColorBeforeTransparency,
                ),
                ...(checked && /^#[0-9a-fA-F]{6}$/.test(scene.backgroundColor)
                  ? { backgroundColorBeforeTransparency: scene.backgroundColor }
                  : {}),
              });
              onCommit?.();
            }}
          />
        </InspectorRow>
      </InspectorGroup>

      <InspectorGroup
        icon={IconCamera}
        title={t("editor.three.camera")}
        defaultOpen={false}
        testId="editor-three-camera-group"
      >
        <InspectorRow label={t("editor.three.projection")}>
          <SegmentedControl
            label={t("editor.three.projection")}
            value={camera.projection}
            options={[
              { value: "orthographic", label: t("editor.three.orthographic") },
              { value: "perspective", label: t("editor.three.perspective") },
            ]}
            onChange={(projection) => {
              patchCamera({ projection });
              onCommit?.();
            }}
          />
        </InspectorRow>
        {["x", "y", "z"].map((axis) => (
          <NumberField
            key={`camera-${axis}`}
            label={t(`editor.three.position${axis.toUpperCase()}`)}
            value={camera.position[axis]}
            onChange={(value) => patchCameraPoint("position", axis, value)}
            onCommit={onCommit}
          />
        ))}
        <NumberField
          label={t("editor.media.fov")}
          value={camera.fov}
          min={1}
          max={179}
          onChange={(fov) => patchCamera({ fov })}
          onCommit={onCommit}
        />
        <NumberField
          label={t("editor.three.zoom")}
          value={camera.zoom}
          min={0.01}
          max={100}
          step={0.01}
          onChange={(zoom) => patchCamera({ zoom })}
          onCommit={onCommit}
        />
      </InspectorGroup>

      <ThreeSceneLighting
        lighting={scene.lighting}
        environment={scene.environment}
        onChange={patchLighting}
        onEnvironmentChange={(patch) =>
          onPatchScene?.({ environment: { ...scene.environment, ...patch } })
        }
        onCommit={onCommit}
        t={t}
      />

      <ThreeSceneEffects
        effects={scene.effects}
        onChange={(effects) => onPatchScene?.({ effects })}
        onCommit={onCommit}
        t={t}
      />

      <ThreeSceneAppearance
        fog={scene.fog}
        sky={scene.sky}
        shadows={scene.shadows}
        colorGrading={scene.colorGrading}
        grid={scene.grid}
        onChange={patchAppearance}
        onCommit={onCommit}
        t={t}
      />

      <ThreeMaterialEditor
        doc={doc}
        onPatchScene={onPatchScene}
        onCommit={onCommit}
        t={t}
      />

      <InspectorGroup
        icon={IconPalette}
        title={t("editor.three.colorAssets")}
        defaultOpen={false}
        testId="editor-three-color-assets"
      >
        {colorVariables.length === 0 ? (
          <EmptyAssets label={t("editor.three.noAssets")} />
        ) : (
          colorVariables.map((variable) => (
            <AssetRow
              key={variable.id}
              label={variable.name}
              color={variable.value}
            />
          ))
        )}
      </InspectorGroup>

      <InspectorGroup
        icon={IconImage}
        title={t("editor.three.imageAssets")}
        defaultOpen={false}
        testId="editor-three-image-assets"
      >
        {imageNodes.length === 0 ? (
          <EmptyAssets label={t("editor.three.noAssets")} />
        ) : (
          imageNodes.map((node) => (
            <AssetRow
              key={node.id}
              label={nodeLabel(node)}
              icon={IconImage}
              onClick={() => selectNode(node.id)}
            />
          ))
        )}
      </InspectorGroup>

      <InspectorGroup
        icon={IconVideo}
        title={t("editor.three.mediaAssets")}
        defaultOpen={false}
        testId="editor-three-media-assets"
      >
        {mediaNodes.length === 0 ? (
          <EmptyAssets label={t("editor.three.noAssets")} />
        ) : (
          mediaNodes.map((node) => (
            <AssetRow
              key={node.id}
              label={nodeLabel(node)}
              icon={node.kind === "video" ? IconVideo : IconBox3}
              onClick={() => selectNode(node.id)}
            />
          ))
        )}
      </InspectorGroup>

      {/* No audio group: the document has no audio node kind, so the section
          could only ever print an empty state under a header that promised
          a list. When a kind exists, its group goes back here beside these. */}
    </>
  );
}

SceneFields.propTypes = {
  doc: PropTypes.object.isRequired,
  engine: PropTypes.object,
  onPatchScene: PropTypes.func,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};

function ObjectFields({
  doc,
  engine = null,
  node,
  duration,
  onPatchScene,
  onPatchNode,
  onCommit,
  t,
}) {
  const spatial = getNodeSpatial(node);
  const patch = (value) => onPatchNode?.(node.id, value);
  // Proportional scaling is a per-object editing aid, not document data.
  const [lockScale, setLockScale] = useState(false);
  const hasDepth =
    node.kind === "mesh3d" &&
    ["box", "cylinder", "cone", "pyramid", "helix", "torus"].includes(
      node.geometry?.type ?? "box",
    );
  const dimensions = {
    width: spatial.width,
    height: spatial.height,
    ...(hasDepth
      ? { depth: node.geometry?.depth ?? Math.min(node.width, node.height) }
      : {}),
  };
  // With the lock on, every dimension follows the edited one by the same ratio.
  const patchDimension = (key, value) => {
    const ratio =
      lockScale && dimensions[key] > 0 ? value / dimensions[key] : null;
    const next = Object.fromEntries(
      Object.entries(dimensions).map(([name, current]) => [
        name,
        name === key ? value : ratio === null ? current : current * ratio,
      ]),
    );
    const fields = {};
    if (ratio !== null || key === "width") fields.width = next.width;
    if (ratio !== null || key === "height") fields.height = next.height;
    if (hasDepth && (ratio !== null || key === "depth"))
      fields.geometry = { ...node.geometry, depth: next.depth };
    patch(fields);
  };
  const scaleFields = Object.keys(dimensions).map((key) => ({
    axis: key === "width" ? "W" : key === "height" ? "H" : "D",
    property: key === "depth" ? "geometry.depth" : key,
    ariaLabel: t(`editor.three.${key}`),
    value: dimensions[key],
    min: 1,
    snapStepOnShift: 10,
    onChange: (value) => patchDimension(key, value),
    onCommit,
  }));
  const material =
    node.kind === "model3d" ? (node.model ?? {}) : (node.material ?? {});
  const patchMaterial = (field, value) =>
    patch({
      [node.kind === "model3d" ? "model" : "material"]: {
        ...material,
        [field]: value,
      },
    });

  return (
    <>
      <InspectorGroup
        icon={IconMove}
        title={t("editor.three.transform")}
        testId="editor-three-transform-group"
      >
        <VectorRow
          testId="editor-three-position"
          label={t("editor.three.position")}
          fields={["x", "y", "z"].map((axis) => ({
            axis: axis.toUpperCase(),
            property: axis === "z" ? "spatial.z" : axis,
            ariaLabel: t(`editor.three.position${axis.toUpperCase()}`),
            value: spatial[axis],
            snapStepOnShift: 10,
            onChange: (value) => patch({ [axis]: value }),
            onCommit,
          }))}
        />
        <VectorRow
          testId="editor-three-scale"
          label={t("editor.three.scale")}
          lock={{
            locked: lockScale,
            onToggle: () => setLockScale((locked) => !locked),
            label: t("editor.three.lockScale"),
          }}
          fields={scaleFields}
        />
        <VectorRow
          testId="editor-three-rotation"
          label={t("editor.three.rotation")}
          fields={["rotationX", "rotationY", "rotationZ"].map((field) => ({
            axis: field.slice(-1),
            property: field === "rotationZ" ? "rotation" : `spatial.${field}`,
            ariaLabel: t(`editor.media.${field}`),
            value: spatial[field],
            min: -360,
            max: 360,
            step: 1,
            snapStepOnShift: 15,
            onChange: (value) => patch({ [field]: value }),
            onCommit,
          }))}
        />
      </InspectorGroup>
      <ThreeNodeStates
        node={node}
        onPatchNode={onPatchNode}
        onCommit={onCommit}
        t={t}
      />
      {["mesh3d", "model3d"].includes(node.kind) ? (
        <ThreeMaterialEditor
          doc={doc}
          node={node}
          onPatchScene={onPatchScene}
          onPatchNode={onPatchNode}
          onCommit={onCommit}
          t={t}
        >
          {!node.materialAssetId ? (
            <ColorField
              label={t("editor.three.color")}
              value={material.color}
              onChange={(value) => patchMaterial("color", value)}
              onCommit={onCommit}
            />
          ) : null}
          {["metalness", "roughness"].map((field) => (
            <ThreeMotionNumberField
              key={field}
              property={`${node.kind === "model3d" ? "model" : "material"}.${field}`}
              label={t(`editor.media.${field}`)}
              value={material[field] ?? (field === "roughness" ? 0.8 : 0)}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => patchMaterial(field, value)}
              onCommit={onCommit}
            />
          ))}
          {node.kind === "model3d" ? (
            <ThreeMotionNumberField
              property="model.scale"
              label={t("editor.media.scale")}
              value={material.scale ?? 1}
              min={0.01}
              max={100}
              step={0.01}
              onChange={(value) => patchMaterial("scale", value)}
              onCommit={onCommit}
            />
          ) : null}
        </ThreeMaterialEditor>
      ) : null}
      {["rect", "ellipse", "path", "text"].includes(node.kind) ? (
        <InspectorGroup
          icon={IconPalette}
          title={t("editor.three.material")}
          defaultOpen={false}
        >
          <ColorField
            label={t("editor.three.color")}
            value={node.fill}
            onChange={(fill) => patch({ fill })}
            onCommit={onCommit}
          />
        </InspectorGroup>
      ) : null}
      <ThreeModifiersGroup
        node={node}
        duration={duration}
        onPatchNode={onPatchNode}
        onCommit={onCommit}
        t={t}
      />
      <LinearArraySection
        object={node}
        engine={engine}
        doc={doc}
        is3d={true}
        t={t}
      />
      <GridArraySection
        object={node}
        engine={engine}
        doc={doc}
        is3d={true}
        t={t}
      />
      <CircularArraySection
        object={node}
        engine={engine}
        doc={doc}
        is3d={true}
        t={t}
      />
      {node.kind === "mesh3d" ? (
        <InspectorGroup
          icon={IconBox3}
          title={t("editor.three.geometry")}
          defaultOpen={false}
          testId="editor-three-geometry-group"
        >
          <ThreeGeometryControls
            node={node}
            onPatchNode={onPatchNode}
            onCommit={onCommit}
            t={t}
          />
        </InspectorGroup>
      ) : null}
      <InspectorGroup
        icon={IconSliders}
        title={t("editor.three.opacity")}
        defaultOpen={false}
        testId="editor-three-opacity-group"
      >
        <NumberField
          label={t("editor.three.opacity")}
          value={node.opacity ?? 1}
          min={0}
          max={1}
          step={0.01}
          onChange={(opacity) => patch({ opacity })}
          onCommit={onCommit}
        />
      </InspectorGroup>
    </>
  );
}

ObjectFields.propTypes = {
  doc: PropTypes.object.isRequired,
  engine: PropTypes.object,
  node: PropTypes.object.isRequired,
  duration: PropTypes.number.isRequired,
  onPatchScene: PropTypes.func,
  onPatchNode: PropTypes.func,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};

export function MultiObjectFields({ nodes, onPatchNode, onCommit, t }) {
  const spatials = nodes.map((node) => getNodeSpatial(node));
  const commonX = commonValue(spatials, "x");
  const commonY = commonValue(spatials, "y");
  const commonZ = commonValue(spatials, "z");

  const commonW = commonValue(spatials, "width");
  const commonH = commonValue(spatials, "height");

  const hasNodeDepth = (n) =>
    n.kind === "mesh3d" &&
    ["box", "cylinder", "cone", "pyramid", "helix", "torus"].includes(
      n.geometry?.type ?? "box",
    );
  const anyDepth = nodes.some(hasNodeDepth);
  const depthNodes = nodes.filter(hasNodeDepth);
  const depths = depthNodes.map(
    (node) => node.geometry?.depth ?? Math.min(node.width, node.height),
  );
  const commonD = anyDepth
    ? commonValue(
        depths.map((d) => ({ depth: d })),
        "depth",
      )
    : MIXED;

  const commonRX = commonValue(spatials, "rotationX");
  const commonRY = commonValue(spatials, "rotationY");
  const commonRZ = commonValue(spatials, "rotationZ");

  const allMesh3d = nodes.every((n) => n.kind === "mesh3d");
  const firstGeoType = nodes[0]?.geometry?.type ?? "box";
  const sharedGeometryType =
    allMesh3d &&
    nodes.every((n) => (n.geometry?.type ?? "box") === firstGeoType)
      ? firstGeoType
      : null;

  const all3d = nodes.every((n) => ["mesh3d", "model3d"].includes(n.kind));
  const all2dShapes = nodes.every((n) =>
    ["rect", "ellipse", "path", "text"].includes(n.kind),
  );

  const colors = nodes.map((n) => {
    const mat = n.kind === "model3d" ? (n.model ?? {}) : (n.material ?? {});
    return mat.color;
  });
  const commonColor = commonValue(
    colors.map((c) => ({ color: c })),
    "color",
  );

  const metalnesses = nodes.map((n) => {
    const mat = n.kind === "model3d" ? (n.model ?? {}) : (n.material ?? {});
    return mat.metalness ?? 0;
  });
  const commonMetalness = commonValue(
    metalnesses.map((m) => ({ metalness: m })),
    "metalness",
  );

  const roughnesses = nodes.map((n) => {
    const mat = n.kind === "model3d" ? (n.model ?? {}) : (n.material ?? {});
    return mat.roughness ?? 0.8;
  });
  const commonRoughness = commonValue(
    roughnesses.map((r) => ({ roughness: r })),
    "roughness",
  );

  const opacities = nodes.map((n) => n.opacity ?? 1);
  const commonOpacity = commonValue(
    opacities.map((o) => ({ opacity: o })),
    "opacity",
  );

  const patchAll = (patchFn) => {
    for (const node of nodes) {
      const patch = patchFn(node);
      if (patch) {
        onPatchNode?.(node.id, patch, { commit: false });
      }
    }
  };

  const patchNodeMaterial = (node, field, value) => {
    const isModel = node.kind === "model3d";
    const current = isModel ? (node.model ?? {}) : (node.material ?? {});
    return {
      [isModel ? "model" : "material"]: {
        ...current,
        [field]: value,
      },
    };
  };

  const scaleFields = [
    {
      axis: "W",
      property: "width",
      ariaLabel: t("editor.three.width"),
      value: commonW === MIXED ? 0 : commonW,
      mixed: commonW === MIXED,
      min: 1,
      onChange: (value) => patchAll(() => ({ width: value })),
      onCommit,
    },
    {
      axis: "H",
      property: "height",
      ariaLabel: t("editor.three.height"),
      value: commonH === MIXED ? 0 : commonH,
      mixed: commonH === MIXED,
      min: 1,
      onChange: (value) => patchAll(() => ({ height: value })),
      onCommit,
    },
    ...(anyDepth
      ? [
          {
            axis: "D",
            property: "geometry.depth",
            ariaLabel: t("editor.three.depth"),
            value: commonD === MIXED ? 0 : commonD,
            mixed: commonD === MIXED,
            min: 1,
            onChange: (value) =>
              patchAll((node) =>
                hasNodeDepth(node)
                  ? {
                      geometry: {
                        ...(node.geometry ?? {
                          type: node.geometry?.type ?? "box",
                        }),
                        depth: value,
                      },
                    }
                  : null,
              ),
            onCommit,
          },
        ]
      : []),
  ];

  return (
    <>
      <InspectorGroup
        icon={IconMove}
        title={t("editor.three.transform")}
        testId="editor-three-transform-group"
      >
        <VectorRow
          testId="editor-three-position"
          label={t("editor.three.position")}
          fields={[
            {
              axis: "X",
              property: "x",
              ariaLabel: t("editor.three.positionX"),
              value: commonX === MIXED ? 0 : commonX,
              mixed: commonX === MIXED,
              onChange: (value) => patchAll(() => ({ x: value })),
              onCommit,
            },
            {
              axis: "Y",
              property: "y",
              ariaLabel: t("editor.three.positionY"),
              value: commonY === MIXED ? 0 : commonY,
              mixed: commonY === MIXED,
              onChange: (value) => patchAll(() => ({ y: value })),
              onCommit,
            },
            {
              axis: "Z",
              property: "spatial.z",
              ariaLabel: t("editor.three.positionZ"),
              value: commonZ === MIXED ? 0 : commonZ,
              mixed: commonZ === MIXED,
              onChange: (value) =>
                patchAll((node) => ({
                  z: value,
                  spatial: { ...(node.spatial ?? {}), z: value },
                })),
              onCommit,
            },
          ]}
        />
        <VectorRow
          testId="editor-three-scale"
          label={t("editor.three.scale")}
          fields={scaleFields}
        />
        <VectorRow
          testId="editor-three-rotation"
          label={t("editor.three.rotation")}
          fields={[
            {
              axis: "X",
              property: "spatial.rotationX",
              ariaLabel: t("editor.media.rotationX"),
              value: commonRX === MIXED ? 0 : commonRX,
              mixed: commonRX === MIXED,
              min: -360,
              max: 360,
              onChange: (value) =>
                patchAll((node) => ({
                  rotationX: value,
                  spatial: { ...(node.spatial ?? {}), rotationX: value },
                })),
              onCommit,
            },
            {
              axis: "Y",
              property: "spatial.rotationY",
              ariaLabel: t("editor.media.rotationY"),
              value: commonRY === MIXED ? 0 : commonRY,
              mixed: commonRY === MIXED,
              min: -360,
              max: 360,
              onChange: (value) =>
                patchAll((node) => ({
                  rotationY: value,
                  spatial: { ...(node.spatial ?? {}), rotationY: value },
                })),
              onCommit,
            },
            {
              axis: "Z",
              property: "rotation",
              ariaLabel: t("editor.media.rotationZ"),
              value: commonRZ === MIXED ? 0 : commonRZ,
              mixed: commonRZ === MIXED,
              min: -360,
              max: 360,
              onChange: (value) =>
                patchAll((node) => ({
                  rotation: value,
                  rotationZ: value,
                  spatial: { ...(node.spatial ?? {}), rotationZ: value },
                })),
              onCommit,
            },
          ]}
        />
      </InspectorGroup>
      {sharedGeometryType ? (
        <InspectorGroup
          icon={IconBox3}
          title={t("editor.three.geometry")}
          defaultOpen={false}
          testId="editor-three-geometry-group"
        >
          <ThreeGeometryControls
            nodes={nodes}
            isMulti={true}
            onPatchNode={onPatchNode}
            onCommit={onCommit}
            t={t}
          />
        </InspectorGroup>
      ) : null}
      {all3d ? (
        <InspectorGroup
          icon={IconPalette}
          title={t("editor.three.material")}
          defaultOpen={true}
          testId="editor-three-material-group"
        >
          <ColorField
            label={t("editor.three.color")}
            value={
              commonColor === MIXED ? "#ffffff" : (commonColor ?? "#ffffff")
            }
            onChange={(value) =>
              patchAll((node) => patchNodeMaterial(node, "color", value))
            }
            onCommit={onCommit}
          />
          <NumberField
            label={t("editor.media.metalness")}
            value={commonMetalness === MIXED ? 0 : commonMetalness}
            mixed={commonMetalness === MIXED}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) =>
              patchAll((node) => patchNodeMaterial(node, "metalness", value))
            }
            onCommit={onCommit}
          />
          <NumberField
            label={t("editor.media.roughness")}
            value={commonRoughness === MIXED ? 0.8 : commonRoughness}
            mixed={commonRoughness === MIXED}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) =>
              patchAll((node) => patchNodeMaterial(node, "roughness", value))
            }
            onCommit={onCommit}
          />
          {nodes.some((n) => n.kind === "model3d") ? (
            <NumberField
              label={t("editor.media.scale")}
              value={
                commonValue(
                  nodes
                    .filter((n) => n.kind === "model3d")
                    .map((n) => ({ scale: n.model?.scale ?? 1 })),
                  "scale",
                ) === MIXED
                  ? 1
                  : (nodes.find((n) => n.kind === "model3d")?.model?.scale ?? 1)
              }
              min={0.01}
              max={100}
              step={0.01}
              onChange={(value) =>
                patchAll((node) =>
                  node.kind === "model3d"
                    ? patchNodeMaterial(node, "scale", value)
                    : null,
                )
              }
              onCommit={onCommit}
            />
          ) : null}
        </InspectorGroup>
      ) : all2dShapes ? (
        <InspectorGroup
          icon={IconPalette}
          title={t("editor.three.material")}
          defaultOpen={false}
          testId="editor-three-material-group"
        >
          <ColorField
            label={t("editor.three.color")}
            value={
              commonValue(
                nodes.map((n) => ({ fill: n.fill })),
                "fill",
              ) === MIXED
                ? "#ffffff"
                : (nodes[0]?.fill ?? "#ffffff")
            }
            onChange={(fill) => patchAll(() => ({ fill }))}
            onCommit={onCommit}
          />
        </InspectorGroup>
      ) : null}
      <InspectorGroup
        icon={IconSliders}
        title={t("editor.three.opacity")}
        defaultOpen={false}
        testId="editor-three-opacity-group"
      >
        <NumberField
          label={t("editor.three.opacity")}
          value={commonOpacity === MIXED ? 1 : commonOpacity}
          mixed={commonOpacity === MIXED}
          min={0}
          max={1}
          step={0.01}
          onChange={(opacity) => patchAll(() => ({ opacity }))}
          onCommit={onCommit}
        />
      </InspectorGroup>
    </>
  );
}

MultiObjectFields.propTypes = {
  nodes: PropTypes.arrayOf(PropTypes.object).isRequired,
  onPatchNode: PropTypes.func,
  onCommit: PropTypes.func,
  t: PropTypes.func.isRequired,
};

/** Switches the properties content between the scene and the selected object(s). */
export function ThreeSceneProperties({
  engine = null,
  doc,
  selectedId = null,
  selectedIds = null,
  onPatchScene = null,
  onPatchNode = null,
  onCommit = null,
}) {
  const { t } = useI18n();
  const effectiveIds =
    Array.isArray(selectedIds) && selectedIds.length > 0
      ? selectedIds
      : (engine?.getSelectedIds?.() ?? (selectedId ? [selectedId] : []));
  const selectedNodes = (doc.nodes ?? []).filter((entry) =>
    effectiveIds.includes(entry.id),
  );
  const singleNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const isMulti = selectedNodes.length > 1;

  return (
    <aside
      data-testid="editor-three-properties"
      data-selected-id={singleNode?.id}
      data-selected-count={selectedNodes.length}
      className="ui-scroll w-full text-neutral-200"
    >
      {isMulti ? (
        <MultiObjectFields
          nodes={selectedNodes}
          onPatchNode={onPatchNode}
          onCommit={onCommit}
          t={t}
        />
      ) : singleNode ? (
        <MotionFieldProvider engine={engine} nodeId={singleNode.id}>
          <ObjectFields
            key={singleNode.id}
            doc={doc}
            engine={engine}
            node={singleNode}
            duration={normalizeTimeline(doc.timeline).duration}
            onPatchScene={onPatchScene}
            onPatchNode={onPatchNode}
            onCommit={onCommit}
            t={t}
          />
        </MotionFieldProvider>
      ) : (
        <SceneFields
          doc={doc}
          engine={engine}
          onPatchScene={onPatchScene}
          onCommit={onCommit}
          t={t}
        />
      )}
    </aside>
  );
}

ThreeSceneProperties.propTypes = {
  engine: PropTypes.object,
  doc: PropTypes.object.isRequired,
  selectedId: PropTypes.string,
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  onPatchScene: PropTypes.func,
  onPatchNode: PropTypes.func,
  onCommit: PropTypes.func,
};

export default ThreeSceneProperties;
