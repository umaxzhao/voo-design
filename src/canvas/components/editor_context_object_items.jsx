import PropTypes from "prop-types";
import EditorContextSubmenu from "./editor_context_submenu.jsx";

export default function EditorContextObjectItems({ model }) {
  const {
    engine,
    selectedCount,
    selectedNode,
    run,
    t,
    itemClass,
    disabledClass,
    isMac,
    formatShortcut,
    canGroup,
    canUngroup,
    onCreateComponent,
    is3D,
    onDetachInstance,
    copyCode,
    copyEditorHtml,
    openCodeDialog,
  } = model;
  if (selectedCount < 1) return null;
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => run(() => engine.cutSelected())}
      >
        <span>{t("editor.menu.cut")}</span>
        <span className="text-[9px] text-neutral-500">
          {formatShortcut("⌘X", isMac)}
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => run(() => engine.duplicateSelected())}
      >
        <span>{t("editor.menu.duplicate")}</span>
        <span className="text-[9px] text-neutral-500">
          {formatShortcut("⌘D", isMac)}
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => run(() => engine.deleteSelected())}
      >
        <span>{t("editor.menu.delete")}</span>
      </button>

      <div className="mx-1 my-0.5 h-px bg-white/10" />

      <button
        type="button"
        role="menuitem"
        className={canGroup ? itemClass : disabledClass}
        disabled={!canGroup}
        onClick={() => run(() => engine.groupSelection())}
      >
        <span>{t("editor.menu.group")}</span>
        <span className="text-[9px] text-neutral-500">
          {formatShortcut("⌘G", isMac)}
        </span>
      </button>

      <button
        type="button"
        role="menuitem"
        className={canUngroup ? itemClass : disabledClass}
        disabled={!canUngroup}
        onClick={() => run(() => engine.ungroupSelection())}
      >
        <span>{t("editor.menu.ungroup")}</span>
        <span className="text-[9px] text-neutral-500">
          {formatShortcut("⇧⌘G", isMac)}
        </span>
      </button>

      <div className="mx-1 my-0.5 h-px bg-white/10" />

      {selectedCount === 1 && (
        <EditorContextSubmenu
          id="select-same"
          label={t("editor.menu.selectSame.title")}
          itemClass={itemClass}
        >
          {selectedCount === 1 ? (
            <>
              {[
                ["fill", "editor.menu.selectSame.fill"],
                ["stroke", "editor.menu.selectSame.stroke"],
                ["font", "editor.menu.selectSame.font"],
                ["kind", "editor.menu.selectSame.kind"],
              ].map(([criteria, label]) => (
                <button
                  key={criteria}
                  type="button"
                  role="menuitem"
                  data-testid={`editor-menu-select-same-${criteria}`}
                  className={itemClass}
                  onClick={() => run(() => engine.selectSame?.(criteria))}
                >
                  <span>{t(label)}</span>
                </button>
              ))}
              <div className="mx-1 my-0.5 h-px bg-white/10" />
            </>
          ) : null}
        </EditorContextSubmenu>
      )}
      <EditorContextSubmenu
        id="properties"
        label={t("editor.menu.properties")}
        itemClass={itemClass}
      >
        <button
          type="button"
          role="menuitem"
          data-testid="editor-menu-copy-properties"
          className={itemClass}
          onClick={() => run(() => engine.copyStyle?.())}
        >
          <span>{t("editor.menu.copyProperties")}</span>
          <span className="text-[9px] text-neutral-500">
            {formatShortcut("⌥⌘C", isMac)}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="editor-menu-paste-properties"
          className={itemClass}
          disabled={!engine.hasStyleClipboard?.()}
          onClick={() => run(() => engine.pasteStyle?.())}
        >
          <span>{t("editor.menu.pasteProperties")}</span>
          <span className="text-[9px] text-neutral-500">
            {formatShortcut("⌥⌘V", isMac)}
          </span>
        </button>
      </EditorContextSubmenu>
      <EditorContextSubmenu
        id="arrange"
        label={t("editor.menu.arrange")}
        itemClass={itemClass}
      >
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => run(() => engine.bringForward?.())}
        >
          <span>{t("editor.menu.bringForward")}</span>
          <span className="text-[9px] text-neutral-500">]</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => run(() => engine.sendBackward?.())}
        >
          <span>{t("editor.menu.sendBackward")}</span>
          <span className="text-[9px] text-neutral-500">[</span>
        </button>

        <div className="mx-1 my-0.5 h-px bg-white/10" />

        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => run(() => engine.bringToFront?.())}
        >
          <span>{t("editor.menu.bringToFront")}</span>
          <span className="text-[9px] text-neutral-500">
            {formatShortcut("⌘]", isMac)}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => run(() => engine.sendToBack?.())}
        >
          <span>{t("editor.menu.sendToBack")}</span>
          <span className="text-[9px] text-neutral-500">
            {formatShortcut("⌘[", isMac)}
          </span>
        </button>
      </EditorContextSubmenu>
      <EditorContextSubmenu
        id="mask"
        label={t("editor.menu.masks")}
        itemClass={itemClass}
      >
        {selectedCount >= 1 ? (
          <>
            <button
              type="button"
              role="menuitem"
              data-testid="editor-menu-create-clip-mask"
              className={itemClass}
              onClick={() => run(() => engine.createClippingMask?.())}
            >
              <span>{t("editor.menu.createClipMask")}</span>
              <span className="text-[9px] text-neutral-500">
                {formatShortcut("⌥⌘G", isMac)}
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="editor-menu-release-clip-mask"
              className={itemClass}
              onClick={() => run(() => engine.releaseClippingMask?.())}
            >
              <span>{t("editor.menu.releaseClipMask")}</span>
              <span className="text-[9px] text-neutral-500">
                {formatShortcut("⇧⌥⌘G", isMac)}
              </span>
            </button>
            <div className="mx-1 my-0.5 h-px bg-white/10" />
          </>
        ) : null}
        {selectedNode?.maskId || engine.getMaskEdit?.()?.nodeId ? (
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() =>
              run(() =>
                engine.clearMask(
                  engine.getMaskEdit?.()?.nodeId || selectedNode?.id,
                ),
              )
            }
          >
            <span>{t("editor.mask.delete")}</span>
          </button>
        ) : null}
      </EditorContextSubmenu>
      {((onCreateComponent && !is3D) ||
        (selectedNode?.kind === "canvasInstance" && onDetachInstance)) && (
        <EditorContextSubmenu
          id="component"
          label={t("editor.menu.components")}
          itemClass={itemClass}
        >
          {onCreateComponent && !is3D ? (
            <button
              type="button"
              role="menuitem"
              data-testid="editor-menu-create-component"
              className={itemClass}
              onClick={() => run(onCreateComponent)}
            >
              <span>{t("editor.component.create")}</span>
              <span className="text-[9px] text-neutral-500">
                {formatShortcut("⌘⌥K", isMac)}
              </span>
            </button>
          ) : null}
          {selectedCount === 1 &&
          selectedNode?.kind === "canvasInstance" &&
          onDetachInstance ? (
            <button
              type="button"
              role="menuitem"
              data-testid="editor-menu-detach-instance"
              className={itemClass}
              onClick={() => run(() => onDetachInstance(selectedNode.id))}
            >
              <span>{t("editor.component.detach")}</span>
              <span className="text-[9px] text-neutral-500">
                {formatShortcut("⌘⌥B", isMac)}
              </span>
            </button>
          ) : null}
        </EditorContextSubmenu>
      )}
      <EditorContextSubmenu
        id="copy-export"
        label={t("editor.menu.copyExport")}
        itemClass={itemClass}
      >
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => run(() => engine.copySelectedSvg?.())}
        >
          <span>{t("editor.menu.copySvg")}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() =>
            run(
              () =>
                void copyEditorHtml(engine, true).catch(() =>
                  window.alert(t("editor.menu.copyHtmlFailed")),
                ),
            )
          }
        >
          <span>{t("editor.menu.copyHtmlCss")}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="editor-menu-copy-code"
          className={itemClass}
          onClick={() => run(() => void copyCode())}
        >
          <span>{t("editor.codegen.copyAction")}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="editor-menu-export-code"
          className={itemClass}
          onClick={openCodeDialog}
        >
          <span>{t("editor.codegen.exportAction")}</span>
        </button>
      </EditorContextSubmenu>
    </>
  );
}
EditorContextObjectItems.propTypes = { model: PropTypes.object.isRequired };
