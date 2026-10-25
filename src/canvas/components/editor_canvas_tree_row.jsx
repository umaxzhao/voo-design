import PropTypes from "prop-types";
import {
  IconChevronDown,
  IconChevronRight,
  IconBox3,
  IconFilm,
  IconFrame,
  IconComponent,
  ICON_STROKE_WIDTH,
} from "../icons.jsx";

export function getCanvasTypeIcon(type, isComponent = false) {
  if (isComponent) return IconComponent;
  if (type === "3d") return IconBox3;
  if (type === "motion") return IconFilm;
  return IconFrame;
}

/**
 * Canvas parent row in the unified layers hierarchy.
 * Displays frame icon, title, type badge, expand/collapse chevron,
 * and handles canvas selection/focus.
 *
 * Canvas roots share the neutral highlight used by the nested layer rows.
 */
export default function EditorCanvasTreeRow({
  page,
  isActive = false,
  isCollapsed = false,
  onToggleCollapse,
  onFocusCanvas,
  t,
}) {
  const isComponent = Boolean(
    page.isComponent || (page.componentUses && page.componentUses > 0),
  );
  const typeKey = page.type === "3d" ? "threeD" : page.type || "design";
  const TypeIcon = getCanvasTypeIcon(page.type, isComponent);
  // Components carry the purple accent in every state; ordinary frames keep the neutral tones.
  let iconTone = "text-neutral-400 group-hover/canvas:text-neutral-200";
  if (isActive) iconTone = "text-neutral-200";
  if (isComponent) iconTone = "text-[#E5B2FF]";

  return (
    <div
      id={`canvas-row-${page.id}`}
      role="option"
      aria-selected={isActive}
      data-testid="editor-canvas-row"
      data-canvas-id={page.id}
      onClick={() => onFocusCanvas?.(page.id)}
      className={`group/canvas flex min-h-8 items-center gap-1 rounded-lg px-1.5 transition-colors cursor-pointer text-neutral-200 ${
        isActive ? "bg-neutral-800" : "hover:bg-white/[0.06]"
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={
          isCollapsed ? t("editor.canvas.expand") : t("editor.canvas.collapse")
        }
        title={
          isCollapsed ? t("editor.canvas.expand") : t("editor.canvas.collapse")
        }
        aria-expanded={!isCollapsed}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapse?.(page.id);
        }}
        className={`-mx-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 ${
          isComponent ? "focus-visible:ring-[#E5B2FF]" : "focus-visible:ring-[#a7ffd4]"
        }`}
      >
        {isCollapsed ? (
          <IconChevronRight size={12} strokeWidth={ICON_STROKE_WIDTH} />
        ) : (
          <IconChevronDown size={12} strokeWidth={ICON_STROKE_WIDTH} />
        )}
      </button>

      <button
        type="button"
        tabIndex={-1}
        data-testid="editor-canvas-layer"
        data-canvas-id={page.id}
        title={page.title}
        aria-current={isActive ? "page" : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onFocusCanvas?.(page.id);
        }}
        className={`flex min-w-0 flex-1 items-center justify-between gap-1.5 self-stretch text-left outline-none focus-visible:ring-1 ${
          isComponent ? "focus-visible:ring-[#E5B2FF]" : "focus-visible:ring-[#a7ffd4]"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <TypeIcon
            size={13}
            strokeWidth={ICON_STROKE_WIDTH}
            className={`shrink-0 ${iconTone}`}
          />
          <span className="truncate text-[11px] font-medium leading-none">
            {page.title}
          </span>
        </div>

        {isComponent ? (
          <span className="ml-2 shrink-0 text-[10px] text-[#E5B2FF] font-mono">
            {t("editor.component.label")}
          </span>
        ) : page.type === "3d" || page.type === "motion" ? (
          <span className="ml-2 shrink-0 text-[10px] text-neutral-500 font-mono">
            {t(`editor.canvasType.${typeKey}`)}
          </span>
        ) : null}
      </button>
    </div>
  );
}

EditorCanvasTreeRow.propTypes = {
  page: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    type: PropTypes.string,
    nodes: PropTypes.array,
    isComponent: PropTypes.bool,
    componentUses: PropTypes.number,
  }).isRequired,
  isActive: PropTypes.bool,
  isCollapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func,
  onFocusCanvas: PropTypes.func,
  t: PropTypes.func.isRequired,
};
