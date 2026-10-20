import PropTypes from "prop-types";
import { useEffect, useRef } from "react";
import {
  IconApi,
  IconBox3,
  IconClapper,
  IconEye,
  IconGallery,
  IconImageAi,
  IconLayers,
  IconLayers2,
  IconVideo,
} from "../icons.jsx";
import { NODE_TYPE_REGISTRY } from "../nodes/registry.js";
import { useI18n } from "../use_i18n.js";

const ICON_COMPONENTS = {
  imageAi: <IconImageAi size={16} />,
  video: <IconVideo size={16} />,
  api: <IconApi size={16} />,
  gallery: <IconGallery size={16} />,
  box: <IconBox3 size={16} />,
  box3: <IconBox3 size={16} />,
  layers: <IconLayers size={16} />,
  layers2: <IconLayers2 size={16} />,
  eye: <IconEye size={16} />,
  storyboard: <IconClapper size={16} />,
};

const ACTIONS = Object.entries(NODE_TYPE_REGISTRY)
  .filter(
    ([, definition]) =>
      definition.toolbarVisible !== false &&
      (definition.quickConnect?.sources?.length ?? 0) > 0,
  )
  .map(([type, definition]) => ({
    type,
    icon: ICON_COMPONENTS[definition.iconKey] ?? <IconImageAi size={16} />,
    labelKey: definition.labelKey,
  }));

/** Compact chooser shown where a compatible output wire ends on empty space. */
export default function QuickConnectMenu({ position, types, onPick, onClose }) {
  const { t } = useI18n();
  const menuRef = useRef(null);

  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("toolbar.addNode")}
      onPointerDown={(event) => event.stopPropagation()}
      className="node-palette absolute z-40 flex w-44 flex-col gap-1 rounded-2xl p-2 shadow-menu"
      style={{ left: position.x, top: position.y }}
    >
      {ACTIONS.filter((action) => types.includes(action.type)).map((action) => (
        <button
          key={action.type}
          type="button"
          role="menuitem"
          onClick={() => onPick(action.type)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[11px] text-neutral-300 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:bg-white/[0.08] focus-visible:outline-none"
        >
          <span className="text-[#a7ffd4]/70">{action.icon}</span>
          {t(action.labelKey)}
        </button>
      ))}
    </div>
  );
}

QuickConnectMenu.propTypes = {
  position: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number })
    .isRequired,
  types: PropTypes.arrayOf(PropTypes.string).isRequired,
  onPick: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
