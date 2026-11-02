import { useI18n } from "../use_i18n.js";
import { useState } from "react";
import { retryAssetLoad, isAssetFailed } from "../editor/bitmap_cache.js";
import { IconRefresh } from "../icons.jsx";
import PropTypes from "prop-types";
function LayerAssetReload({
  assetKey
}) {
  const {
    t
  } = useI18n();
  const [retrying, setRetrying] = useState(false);
  if (!retrying && !isAssetFailed(assetKey)) return null;
  return <button
    type="button"
    data-no-drag
    disabled={retrying}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => {
      event.stopPropagation();
      setRetrying(true);
      void retryAssetLoad(assetKey).finally(() => setRetrying(false));
    }}
    title={t("editor.assets.reloadAsset")}
    aria-label={t("editor.assets.reloadAsset")}
    className="flex h-7 w-4 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/5"
  >
    <IconRefresh
      size={11}
      className={retrying ? "animate-spin" : undefined}
    />
  </button>;
}
LayerAssetReload.propTypes = {
  assetKey: PropTypes.string.isRequired
};
export default LayerAssetReload;
