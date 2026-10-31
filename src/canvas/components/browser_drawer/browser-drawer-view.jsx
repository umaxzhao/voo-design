import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Download,
  MousePointerClick,
  ExternalLink,
  X,
  Camera,
  Search,
  Code,
  Check,
  Globe,
  MoreHorizontal,
} from "lucide-react";

export default function BrowserDrawerView({ model, onClose }) {
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
    webviewRef,
    iframeRef,
    isElectron,
    handleUrlSubmit,
    handleFrameLoad,
    handleFrameError,
    handleStartPick,
    handleStopPick,
    reload,
    handleImportFullPage,
    handleCaptureViewport,
    handleImportCustomHtml,
  } = model;
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);

  useEffect(() => {
    if (!toolsOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!toolsRef.current?.contains(event.target)) setToolsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [toolsOpen]);

  const runTool = (action) => {
    setToolsOpen(false);
    action();
  };

  return (
    <aside
      data-testid="voo-browser-drawer"
      role="region"
      aria-label={t("browser.title")}
      className="voo-browser-drawer flex min-h-0 min-w-0 shrink-0 flex-col border-l border-white/10 bg-neutral-950"
    >
      <div className="browser-drawer-toolbar flex h-12 shrink-0 items-center gap-1.5 border-b border-white/10 bg-neutral-950 px-2.5 text-xs">
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() =>
              webviewRef.current?.goBack?.() ||
              iframeRef.current?.contentWindow?.history.back?.()
            }
            aria-label={t("browser.back")}
            title={t("browser.back")}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() =>
              webviewRef.current?.goForward?.() ||
              iframeRef.current?.contentWindow?.history.forward?.()
            }
            aria-label={t("browser.forward")}
            title={t("browser.forward")}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={reload}
            aria-label={t("browser.refresh")}
            title={t("browser.refresh")}
            className={`flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white ${isLoading ? "animate-spin text-[#b2ffd6]" : ""}`}
          >
            <RotateCw size={13} />
          </button>
        </div>

        <form
          onSubmit={handleUrlSubmit}
          className="browser-address-bar relative flex h-8 min-w-0 flex-1 items-center rounded-lg border border-white/5 bg-neutral-900 px-2.5 transition-colors focus-within:border-[#b2ffd6]/40 focus-within:bg-neutral-800"
        >
          <Globe size={14} className="mr-2 shrink-0 text-neutral-500" aria-hidden="true" />
          <input
            aria-label={t("browser.urlPlaceholder")}
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder={t("browser.urlPlaceholder")}
            className="h-full w-full min-w-0 bg-transparent pr-7 text-[12px] text-neutral-200 outline-none placeholder:text-neutral-400"
          />
          <button
            type="submit"
            title={t("browser.navigate")}
            aria-label={t("browser.navigate")}
            className="absolute right-1 flex size-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200"
          >
            <Search size={12} />
          </button>
        </form>

        <div ref={toolsRef} className="relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={t("browser.actions")}
            aria-expanded={toolsOpen}
            title={t("browser.actions")}
            onClick={() => setToolsOpen((open) => !open)}
            className={`flex size-8 items-center justify-center rounded-lg transition-colors ${toolsOpen ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/10 hover:text-white"}`}
          >
            <MoreHorizontal size={16} />
          </button>
          {toolsOpen && (
            <div role="menu" aria-label={t("browser.actions")} className="absolute right-0 top-full z-10 mt-2 flex w-52 flex-col rounded-xl border border-white/10 bg-neutral-900 p-1 shadow-panel">
              <button type="button" role="menuitem" onClick={() => runTool(isPicking ? handleStopPick : handleStartPick)} className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-200 hover:bg-white/10">
                <MousePointerClick size={14} className={isPicking ? "text-[#b2ffd6]" : "text-neutral-400"} />
                <span>{isPicking ? t("browser.picking") : t("browser.pickElement")}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runTool(handleImportFullPage)} disabled={isLoading} className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-200 hover:bg-white/10 disabled:opacity-40">
                <Download size={14} className="text-neutral-400" />
                <span>{t("browser.importPage")}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runTool(handleCaptureViewport)} className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-200 hover:bg-white/10">
                <Camera size={14} className="text-neutral-400" />
                <span>{t("browser.captureImage")}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runTool(() => setShowCustomHtml((previous) => !previous))} className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-200 hover:bg-white/10">
                <Code size={14} className="text-neutral-400" />
                <span>{t("browser.customHtml")}</span>
              </button>
              <div className="my-1 border-t border-white/10" />
              <button type="button" role="menuitem" onClick={() => runTool(() => window.open(url, "_blank", "noopener,noreferrer"))} className="flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-200 hover:bg-white/10">
                <ExternalLink size={14} className="text-neutral-400" />
                <span>{t("browser.external")}</span>
              </button>
            </div>
          )}
        </div>

        <div className="h-5 w-px shrink-0 bg-white/10" />
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("browser.close")}
            title={t("browser.close")}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {isLoading && <div className="browser-load-track shrink-0" role="progressbar" aria-label={t("browser.loading")} />}

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
            onLoad={handleFrameLoad}
            onError={handleFrameError}
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
};
