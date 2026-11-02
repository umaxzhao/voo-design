import GlobalOverlayPortal from "./global_overlay_portal.jsx";
import PropTypes from "prop-types";
import { memo, useEffect } from "react";
import { IconClose } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";

/**
 * One keyboard-shortcut reference modal for both the Design/Image editor and
 * the Clip editor. The contents are pure data (see shared/editor-shortcut-catalog.js);
 * this shell only renders groups and calls t() for user-visible labels.
 */
function Kbd({ children }) {
  return (
    <kbd className="min-w-5 rounded-md border border-white/10 bg-white/[0.08] px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-neutral-200">
      {children}
    </kbd>
  );
}

Kbd.propTypes = {
  children: PropTypes.node.isRequired,
};

function ShortcutReferenceModal({
  isOpen,
  onClose,
  titleKey,
  groups,
  closeLabelKey = "editor.cancel",
  overlayClassName = "fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm",
  panelClassName = "relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#181818] p-6 shadow-panel font-mono text-neutral-200",
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const surface = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(titleKey)}
      className={overlayClassName}
      onClick={onClose}
    >
      <div
        className={panelClassName}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-white">
              {t(titleKey)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(closeLabelKey)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
                {t(group.titleKey)}
              </div>
              <div className="flex flex-col rounded-xl bg-white/[0.03] p-2 border border-white/[0.06]">
                {group.shortcuts.map((item, index) => {
                  const keys = item.keys ?? [item.key];
                  return (
                    <div
                      key={item.id ?? `${group.id}-${index}`}
                      className="flex items-center justify-between py-1.5 px-2 text-[12px] border-b border-white/[0.03] last:border-0"
                    >
                      <span className="text-neutral-300">
                        {t(item.labelKey)}
                      </span>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  return <GlobalOverlayPortal>{surface}</GlobalOverlayPortal>;
}

ShortcutReferenceModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  titleKey: PropTypes.string.isRequired,
  groups: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      titleKey: PropTypes.string.isRequired,
      shortcuts: PropTypes.arrayOf(
        PropTypes.shape({
          key: PropTypes.string,
          keys: PropTypes.arrayOf(PropTypes.string),
          labelKey: PropTypes.string.isRequired,
        }),
      ).isRequired,
    }),
  ).isRequired,
  closeLabelKey: PropTypes.string,
  overlayClassName: PropTypes.string,
  panelClassName: PropTypes.string,
};

export default memo(ShortcutReferenceModal);
