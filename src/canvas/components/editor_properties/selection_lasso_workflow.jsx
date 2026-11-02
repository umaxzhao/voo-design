/** Lasso workflow actions (cutout, keep, erase, cancel) and subject auto-selection button. */

import PropTypes from "prop-types";
import { TOOL } from "../../editor/editor_constants.js";
import { useI18n } from "../../use_i18n.js";
import { IconSparkle } from "../../icons.jsx";

export default function SelectionLassoWorkflow({
  tool,
  lassoSaved = false,
  lassoBusy = false,
  localMattingSupported = true,
  onLassoCutout,
  onLassoEraseInside,
  onLassoKeepInside,
  onLassoCancel,
  onSelectSubject,
}) {
  const { t } = useI18n();

  const isLassoActive = tool === TOOL.LASSO && lassoSaved;
  if (!isLassoActive && !onSelectSubject) return null;

  return (
    <>
      {isLassoActive && (
        <div className="space-y-1.5 pt-1">
          {onLassoCutout && (
            <button
              type="button"
              data-testid="lasso-cutout"
              disabled={lassoBusy || !localMattingSupported}
              onClick={() => onLassoCutout()}
              title={t("editor.lasso.cutoutHint")}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#E5B2FF] py-2 text-[11px] font-mono text-black hover:bg-[#eed0ff] transition-all font-medium disabled:opacity-50"
            >
              <IconSparkle size={13} className="text-black shrink-0" />
              <span>{t("editor.lasso.cutout")}</span>
            </button>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {onLassoEraseInside && (
              <button
                type="button"
                data-testid="lasso-erase-inside"
                disabled={lassoBusy}
                onClick={() => onLassoEraseInside()}
                className="rounded-xl bg-white py-1.5 text-[10px] font-mono font-medium text-black hover:bg-neutral-200 transition-colors disabled:opacity-50"
              >
                {t("editor.lasso.eraseInside")}
              </button>
            )}
            {onLassoKeepInside && (
              <button
                type="button"
                data-testid="lasso-keep-inside"
                disabled={lassoBusy}
                onClick={() => onLassoKeepInside()}
                className="rounded-xl bg-[#282828] py-1.5 text-[10px] font-mono text-white hover:bg-[#333333] transition-colors disabled:opacity-50"
              >
                {t("editor.lasso.keepInside")}
              </button>
            )}
          </div>
          {onLassoCancel && (
            <button
              type="button"
              disabled={lassoBusy}
              onClick={() => onLassoCancel()}
              className="w-full rounded-xl bg-rose-500/15 py-1.5 text-[10px] font-mono text-rose-300 hover:bg-rose-500/25 transition-colors disabled:opacity-50"
            >
              {t("editor.lasso.cancel")}
            </button>
          )}
        </div>
      )}

      {onSelectSubject && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => onSelectSubject()}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#E5B2FF] py-2 text-[11px] font-mono text-black hover:bg-[#eed0ff] transition-all font-medium"
          >
            <IconSparkle size={13} className="text-black shrink-0" />
            <span>{t("editor.region.modeSubject")}</span>
          </button>
        </div>
      )}
    </>
  );
}

SelectionLassoWorkflow.propTypes = {
  tool: PropTypes.string,
  lassoSaved: PropTypes.bool,
  lassoBusy: PropTypes.bool,
  localMattingSupported: PropTypes.bool,
  onLassoCutout: PropTypes.func,
  onLassoEraseInside: PropTypes.func,
  onLassoKeepInside: PropTypes.func,
  onLassoCancel: PropTypes.func,
  onSelectSubject: PropTypes.func,
};
