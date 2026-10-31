import PropTypes from "prop-types";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Download,
  MousePointerClick,
  ExternalLink,
  X,
  Camera,
  Search,
  Code,
  Check,
} from "lucide-react";
import { DEFAULT_HOME_URL, PRESET_SITES } from "./browser-config.js";

export default function BrowserDrawerView({ model, onClose, top }) {
  const {
    t,
    url,
    inputUrl,
    setInputUrl,
    isLoading,
    isPicking,
    importStatus,
    setImportStatus,
    showCustomHtml,
    setShowCustomHtml,
    customHtml,
    setCustomHtml,
    drawerWidth,
    isResizingRef,
    webviewRef,
    iframeRef,
    isElectron,
    navigateTo,
    handleUrlSubmit,
    handleStartPick,
    handleStopPick,
    handleImportFullPage,
    handleCaptureViewport,
    handleImportCustomHtml,
  } = model;
  return (
    <aside
      data-testid="voo-browser-drawer"
      role="region"
      aria-label={t("browser.title")}
      className="voo-browser-drawer fixed right-0 bottom-0 z-[70] flex flex-col border-l border-white/10 bg-neutral-900 shadow-panel"
      style={{ top, width: `min(${drawerWidth}px, 100vw)` }}
    >
      {/* Left resize handle */}
      <div
        onMouseDown={() => (isResizingRef.current = true)}
        className="absolute -left-1 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-emerald-500/30 transition-colors"
        title={t("browser.resize")}
      />

      {/* Top Browser Bar */}
      <div className="browser-drawer-toolbar flex min-h-11 flex-wrap shrink-0 items-center justify-between gap-1.5 py-1.5 border-b border-white/10 bg-neutral-900 px-2 text-xs">
        {/* Navigation controls */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() =>
              webviewRef.current?.goBack?.() ||
              iframeRef.current?.contentWindow?.history.back?.()
            }
            title={t("browser.back")}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() =>
              webviewRef.current?.goForward?.() ||
              iframeRef.current?.contentWindow?.history.forward?.()
            }
            title={t("browser.forward")}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (webviewRef.current) webviewRef.current.reload();
              else if (iframeRef.current) iframeRef.current.src = url;
            }}
            title={t("browser.refresh")}
            className={`flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors ${isLoading ? "animate-spin text-emerald-400" : ""}`}
          >
            <RotateCw size={13} />
          </button>
          <button
            type="button"
            onClick={() => navigateTo(DEFAULT_HOME_URL)}
            title={t("browser.home")}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Home size={13} />
          </button>
        </div>

        {/* Address Bar Form */}
        <form
          onSubmit={handleUrlSubmit}
          className="relative flex flex-1 min-w-24 items-center"
        >
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder={t("browser.urlPlaceholder")}
            className="h-7 w-full rounded-lg bg-neutral-950 px-2.5 pr-7 text-[11px] font-mono text-neutral-200 outline-none ring-1 ring-white/10 focus:ring-emerald-500/50"
          />
          <button
            type="submit"
            title={t("browser.navigate")}
            className="absolute right-1 flex size-5 items-center justify-center text-neutral-500 hover:text-neutral-300"
          >
            <Search size={12} />
          </button>
        </form>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={isPicking ? handleStopPick : handleStartPick}
            title={
              isPicking ? t("browser.cancelPick") : t("browser.pickElement")
            }
            className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-all ${
              isPicking
                ? "bg-[#a7ffd4]/20 text-[#a7ffd4] ring-1 ring-[#a7ffd4]/40"
                : "bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <MousePointerClick size={13} />
            <span className="hidden sm:inline">
              {isPicking ? t("browser.picking") : t("browser.pickElement")}
            </span>
          </button>

          <button
            type="button"
            onClick={handleImportFullPage}
            disabled={isLoading}
            title={t("browser.importPage")}
            className="flex h-7 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            <span className="hidden sm:inline">{t("browser.importPage")}</span>
          </button>

          <button
            type="button"
            onClick={handleCaptureViewport}
            title={t("browser.captureImage")}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Camera size={13} />
          </button>

          <button
            type="button"
            onClick={() => setShowCustomHtml((prev) => !prev)}
            title={t("browser.customHtml")}
            className={`flex size-7 items-center justify-center rounded-lg transition-colors ${showCustomHtml ? "bg-white/20 text-white" : "text-neutral-400 hover:bg-white/10 hover:text-white"}`}
          >
            <Code size={13} />
          </button>

          <button
            type="button"
            onClick={() => window.open(url, "_blank")}
            title={t("browser.external")}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ExternalLink size={13} />
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={onClose}
            title={t("browser.close")}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Picking status banner */}
      {isPicking && (
        <div className="flex items-center justify-between border-b border-white/10 bg-neutral-800/95 px-3 py-1.5 text-[11px] text-neutral-200">
          <div className="flex items-center gap-1.5 font-medium">
            <MousePointerClick size={13} className="text-[#b2ffd6]" />
            <span>{t("browser.pickingHint")}</span>
          </div>
          <button
            type="button"
            onClick={handleStopPick}
            className="rounded-lg bg-neutral-700 px-2.5 py-0.5 text-xs text-neutral-200 hover:bg-neutral-600"
          >
            {t("browser.cancel")}
          </button>
        </div>
      )}

      {/* Import Status Alert Banner */}
      {importStatus && (
        <div
          className={`flex items-center justify-between px-3 py-1.5 text-[11px] border-b ${
            importStatus.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : importStatus.type === "error"
                ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                : "bg-neutral-800 border-white/10 text-neutral-200"
          }`}
        >
          <div className="flex items-center gap-1.5">
            {importStatus.type === "success" && (
              <Check size={13} className="text-emerald-400" />
            )}
            <span>{importStatus.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportStatus(null)}
            className="text-neutral-400 hover:text-white text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Preset Quick Links Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/5 bg-neutral-900 px-2 py-1 text-[10px] no-scrollbar">
        <span className="text-neutral-500 font-mono text-[9px] uppercase tracking-wider shrink-0 mr-1">
          {t("browser.quick")}
        </span>
        {PRESET_SITES.map((site) => (
          <button
            key={site.name}
            type="button"
            onClick={() => navigateTo(site.url)}
            title={t(site.descriptionKey)}
            className="flex items-center shrink-0 rounded-lg bg-white/5 px-2 py-0.5 text-neutral-300 hover:bg-white/15 hover:text-white transition-colors"
          >
            {site.name}
          </button>
        ))}
      </div>

      {/* Custom HTML Paste Drawer */}
      {showCustomHtml && (
        <div className="flex flex-col gap-2 border-b border-white/10 bg-neutral-900 p-3">
          <div className="flex items-center justify-between text-xs text-neutral-300 font-medium">
            <span>{t("browser.htmlTitle")}</span>
            <button
              type="button"
              onClick={() => setShowCustomHtml(false)}
              className="text-neutral-500 hover:text-neutral-300 text-xs"
            >
              {t("browser.cancel")}
            </button>
          </div>
          <textarea
            value={customHtml}
            onChange={(e) => setCustomHtml(e.target.value)}
            placeholder={t("browser.htmlPlaceholder")}
            rows={4}
            className="w-full rounded-lg bg-neutral-950 p-2 text-xs font-mono text-neutral-200 outline-none ring-1 ring-white/10 focus:ring-emerald-500/50"
          />
          <button
            type="button"
            onClick={handleImportCustomHtml}
            disabled={!customHtml.trim() || isLoading}
            className="self-end rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40"
          >
            {t("browser.convert")}
          </button>
        </div>
      )}

      {/* Main Browser View Area */}
      <div className="relative flex-1 min-h-0 bg-neutral-950">
        {isElectron ? (
          <webview
            ref={webviewRef}
            src={url}
            className="h-full w-full bg-white"
            // allow full web permissions and script injection
            webpreferences="contextIsolation=no"
          />
        ) : (
          <iframe
            ref={iframeRef}
            src={url}
            title={t("browser.title")}
            className="h-full w-full border-none bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}
      </div>
    </aside>
  );
}

BrowserDrawerView.propTypes = {
  model: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  top: PropTypes.number.isRequired,
};
