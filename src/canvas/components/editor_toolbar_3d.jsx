import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import {
  ICON_STROKE_WIDTH,
  IconBox3,
  IconCheck,
  IconChevronDown,
  IconCircle,
  IconCone,
  IconCylinder,
  IconDodecahedron,
  IconExpand,
  IconHelix,
  IconIcosahedron,
  IconMove,
  IconPolygon,
  IconPyramid,
  IconRotateCcw,
  IconSphere,
  IconSquare,
  IconStar,
  IconTorus,
  IconTorusKnot,
  IconTriangle,
} from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import { toolButtonClass } from "./editor_toolbar.jsx";
import EditorTooltip from "./editor_tooltip.jsx";

/**
 * The 3D canvas's top toolbar. A 3D page gets transform tools instead of the
 * Design brush/shape row, so the active tool is discoverable from the same
 * place as every other mode rather than only inside the viewport.
 */
export const THREE_TOOL_OPTIONS = [
  {
    mode: "translate",
    labelKey: "editor.three.moveTool",
    shortcut: "G",
    id: "move",
    Icon: IconMove,
  },
  {
    mode: "rotate",
    labelKey: "editor.three.rotateTool",
    shortcut: "R",
    id: "rotate",
    Icon: IconRotateCcw,
  },
  {
    mode: "scale",
    labelKey: "editor.three.scaleTool",
    shortcut: "S",
    id: "scale",
    Icon: IconExpand,
  },
];

/** 10 3D volumetric primitives the toolbar can drop into the scene. */
export const THREE_PRIMITIVE_OPTIONS = [
  { type: "box", labelKey: "editor.three.box", Icon: IconBox3 },
  { type: "sphere", labelKey: "editor.three.sphere", Icon: IconSphere },
  { type: "cylinder", labelKey: "editor.three.cylinder", Icon: IconCylinder },
  { type: "cone", labelKey: "editor.three.cone", Icon: IconCone },
  { type: "pyramid", labelKey: "editor.three.pyramid", Icon: IconPyramid },
  { type: "torus", labelKey: "editor.three.torus", Icon: IconTorus },
  { type: "helix", labelKey: "editor.three.helix", Icon: IconHelix },
  { type: "torusKnot", labelKey: "editor.three.torusKnot", Icon: IconTorusKnot },
  { type: "icosahedron", labelKey: "editor.three.icosahedron", Icon: IconIcosahedron },
  { type: "dodecahedron", labelKey: "editor.three.dodecahedron", Icon: IconDodecahedron },
];

/** 5 Planar shapes oriented on the XY plane in 3D. */
export const THREE_PLANAR_OPTIONS = [
  { type: "plane", labelKey: "editor.three.rect", Icon: IconSquare },
  { type: "ellipse", labelKey: "editor.three.ellipse", Icon: IconCircle },
  { type: "triangle", labelKey: "editor.three.triangle", Icon: IconTriangle },
  { type: "polygon", labelKey: "editor.three.polygon", Icon: IconPolygon },
  { type: "star", labelKey: "editor.three.star", Icon: IconStar },
];

function ShapeDropdownMenu({
  options,
  activeType,
  onSelect,
  menuLabel,
  testIdPrefix,
  t,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const activeOption =
    options.find((opt) => opt.type === activeType) ?? options[0];
  const ActiveIcon = activeOption.Icon;
  const activeLabel = t(activeOption.labelKey);

  return (
    <div ref={rootRef} className="relative flex items-center">
      <div className="flex items-center rounded-full text-neutral-400 transition-all hover:bg-[#262626] hover:text-neutral-100">
        <EditorTooltip
          title={t("editor.three.addPrimitive", { shape: activeLabel })}
          side="top"
        >
          <button
            type="button"
            data-testid={`editor-three-add-${activeType}`}
            aria-label={t("editor.three.addPrimitive", { shape: activeLabel })}
            onClick={() => onSelect(activeType)}
            className="rounded-l-full py-2.5 pl-2.5 pr-1 focus:outline-none focus-visible:text-white"
          >
            <ActiveIcon size={16} strokeWidth={ICON_STROKE_WIDTH} />
          </button>
        </EditorTooltip>
        <button
          type="button"
          data-testid={`editor-three-${testIdPrefix}-menu-toggle`}
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="rounded-r-full py-2.5 pl-0.5 pr-1.5 focus:outline-none focus-visible:text-white"
        >
          <IconChevronDown
            size={10}
            strokeWidth={ICON_STROKE_WIDTH}
            className={`transition-colors ${open ? "text-white" : "text-neutral-400"}`}
          />
        </button>
      </div>

      {open ? (
        <div
          role="menu"
          aria-label={menuLabel}
          className="absolute left-1/2 top-full z-40 mt-2 flex min-w-[150px] -translate-x-1/2 flex-col gap-0.5 rounded-xl border border-white/10 bg-surface-raised p-1 font-mono shadow-menu"
        >
          {options.map(({ type, labelKey, Icon }) => {
            const isSelected = type === activeType;
            const itemLabel = t(labelKey);
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                data-testid={`editor-three-add-${type}`}
                onClick={() => {
                  onSelect(type);
                  setOpen(false);
                }}
                className="group flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[11px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:bg-white/10 focus:text-white"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    size={14}
                    strokeWidth={ICON_STROKE_WIDTH}
                    className="shrink-0 text-neutral-400 group-hover:text-white"
                  />
                  <span className="truncate leading-none">{itemLabel}</span>
                </div>
                {isSelected ? (
                  <IconCheck
                    size={12}
                    strokeWidth={ICON_STROKE_WIDTH}
                    className="shrink-0 text-white"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

ShapeDropdownMenu.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      type: PropTypes.string.isRequired,
      labelKey: PropTypes.string.isRequired,
      Icon: PropTypes.elementType.isRequired,
    }),
  ).isRequired,
  activeType: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  menuLabel: PropTypes.string.isRequired,
  testIdPrefix: PropTypes.string.isRequired,
  t: PropTypes.func.isRequired,
};

export default function EditorToolbar3D({
  mode,
  onMode,
  onAddPrimitive = null,
}) {
  const { t } = useI18n();
  const [activePrimitive, setActivePrimitive] = useState("box");
  const [activePlanar, setActivePlanar] = useState("plane");

  const handleSelectPrimitive = (type) => {
    setActivePrimitive(type);
    onAddPrimitive?.(type);
  };

  const handleSelectPlanar = (type) => {
    setActivePlanar(type);
    onAddPrimitive?.(type);
  };

  return (
    <div
      data-testid="editor-three-toolbar"
      className="absolute top-[14px] left-1/2 z-30 -translate-x-1/2"
    >
      <div className="flex items-center gap-1 rounded-full bg-black/90 p-1.5 shadow-pop backdrop-blur-md font-mono">
        {THREE_TOOL_OPTIONS.map(
          ({ mode: toolMode, labelKey, shortcut, id, Icon }) => {
            const active = mode === toolMode;
            const label = t(labelKey);
            return (
              <EditorTooltip
                key={toolMode}
                title={label}
                shortcut={shortcut}
                side="top"
              >
                <button
                  type="button"
                  data-testid={`editor-three-tool-${id}`}
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => onMode?.(toolMode)}
                  className={toolButtonClass(active)}
                >
                  <Icon size={16} strokeWidth={ICON_STROKE_WIDTH} />
                </button>
              </EditorTooltip>
            );
          },
        )}
        {onAddPrimitive ? (
          <>
            <span aria-hidden className="mx-0.5 h-5 w-px bg-white/10" />
            <ShapeDropdownMenu
              options={THREE_PRIMITIVE_OPTIONS}
              activeType={activePrimitive}
              onSelect={handleSelectPrimitive}
              menuLabel={t("editor.three.primitives3d")}
              testIdPrefix="primitive"
              t={t}
            />
            <ShapeDropdownMenu
              options={THREE_PLANAR_OPTIONS}
              activeType={activePlanar}
              onSelect={handleSelectPlanar}
              menuLabel={t("editor.three.planarShapes")}
              testIdPrefix="planar"
              t={t}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

EditorToolbar3D.propTypes = {
  mode: PropTypes.oneOf(["translate", "rotate", "scale"]).isRequired,
  onMode: PropTypes.func.isRequired,
  onAddPrimitive: PropTypes.func,
};
