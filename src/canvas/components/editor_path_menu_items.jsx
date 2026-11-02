import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import {
  PATH_MENU_ACTION,
  PATH_OFFSET_AMOUNT,
  isClosedPath,
  pathMenuActions,
} from "../editor/path_menu_actions.js";

/** Runs one path operation on the engine; the engine decides if it applies. */
function runPathAction(engine, action, offsetAmount) {
  switch (action) {
    case PATH_MENU_ACTION.SIMPLIFY:
      return engine.simplifySelectedPath?.();
    case PATH_MENU_ACTION.REVERSE:
      return engine.reverseSelectedPath?.();
    case PATH_MENU_ACTION.JOIN:
      return engine.joinSelectedPaths?.();
    case PATH_MENU_ACTION.TOGGLE_CLOSE:
      return engine.toggleCloseSelectedPath?.();
    case PATH_MENU_ACTION.OUTSET:
      return engine.offsetSelectedPath?.(offsetAmount);
    case PATH_MENU_ACTION.INSET:
      return engine.offsetSelectedPath?.(-offsetAmount);
    default:
      return false;
  }
}

/** Path section of the canvas context menu; renders nothing when not applicable. */
export default function EditorPathMenuItems({ engine, nodes, run, itemClass }) {
  const { t } = useI18n();
  const actions = pathMenuActions(nodes);
  if (actions.length === 0) return null;
  const single = nodes.length === 1 ? nodes[0] : null;

  const labelFor = (action) => {
    switch (action) {
      case PATH_MENU_ACTION.SIMPLIFY:
        return t("editor.menu.path.simplify");
      case PATH_MENU_ACTION.REVERSE:
        return t("editor.menu.path.reverse");
      case PATH_MENU_ACTION.JOIN:
        return t("editor.menu.path.join");
      case PATH_MENU_ACTION.TOGGLE_CLOSE:
        return isClosedPath(single)
          ? t("editor.menu.path.open")
          : t("editor.menu.path.close");
      case PATH_MENU_ACTION.OUTSET:
        return t("editor.menu.path.outset", { amount: PATH_OFFSET_AMOUNT });
      case PATH_MENU_ACTION.INSET:
        return t("editor.menu.path.inset", { amount: PATH_OFFSET_AMOUNT });
      default:
        return "";
    }
  };

  return (
    <>
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => run(() => runPathAction(engine, action, PATH_OFFSET_AMOUNT))}
        >
          <span>{labelFor(action)}</span>
        </button>
      ))}
      <div className="mx-1 my-0.5 h-px bg-white/10" />
    </>
  );
}

EditorPathMenuItems.propTypes = {
  engine: PropTypes.object.isRequired,
  nodes: PropTypes.arrayOf(PropTypes.object).isRequired,
  run: PropTypes.func.isRequired,
  itemClass: PropTypes.string.isRequired,
};
