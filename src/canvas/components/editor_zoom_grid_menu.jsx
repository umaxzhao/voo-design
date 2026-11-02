import PropTypes from "prop-types";
import { IconMagnet } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";

export default function EditorZoomGridMenu({ snapToGrid, onToggleSnapToGrid, gridSize, onSetGridSize, onClose }) {
  const { t } = useI18n();
  return (
    <div
      id="editor-grid-menu"
      data-testid="editor-grid-menu"
      role="menu"
      aria-label={t("editor.grid.options")}
      className="mt-1 border-t border-white/10 pt-1"
    >
      <button
        type="button"
        role="menuitemcheckbox"
        data-testid="editor-grid-menu-snap"
        aria-checked={snapToGrid}
        onClick={onToggleSnapToGrid}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 hover:text-white focus-visible:bg-neutral-800 outline-none"
      >
        <IconMagnet size={13} />
        {t("editor.snapping.toGrid")}
        <span aria-hidden="true" className="ml-auto text-neutral-400">{snapToGrid ? "✓" : ""}</span>
      </button>
  
      <div className="my-1 border-t border-white/10" role="separator" />
      <div className="px-2 py-1 text-neutral-400">{t("editor.grid.size")}</div>
      {[8, 16, 32, 64].map((size) => (
        <button
          key={size}
          type="button"
          role="menuitemradio"
          aria-checked={gridSize === size}
          data-testid={`editor-grid-size-${size}`}
          onClick={() => {
            onSetGridSize?.(size);
            onClose();
          }}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 hover:text-white focus-visible:bg-neutral-800 outline-none"
        >
          {t("editor.grid.sizeLabel", { size })}
          <span aria-hidden="true" className="text-neutral-400">{gridSize === size ? "✓" : ""}</span>
        </button>
      ))}
    </div>
  );
}

EditorZoomGridMenu.propTypes = {
  snapToGrid: PropTypes.bool.isRequired,
  onToggleSnapToGrid: PropTypes.func,
  gridSize: PropTypes.number.isRequired,
  onSetGridSize: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
