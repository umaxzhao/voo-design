import React, { useState, useRef, useEffect, useCallback } from "react";
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
  Sparkles,
  Check,
} from "lucide-react";
import { useDesignStore } from "../../../store/design_store.js";
import { useI18n } from "../../use_i18n.js";
import { importHtmlSnippetToCanvas } from "./browser_import_helpers.js";
import { INJECTED_PICKER_CODE } from "./browser_picker_script.js";

const DEFAULT_HOME_URL = "https://www.awwwards.com";

const PRESET_SITES = [
  { name: "Awwwards", url: "https://www.awwwards.com", desc: "Website Awards & Design Inspiration" },
];

export default function BrowserDrawer({ open, onClose }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(DEFAULT_HOME_URL);
  const [inputUrl, setInputUrl] = useState(DEFAULT_HOME_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [importStatus, setImportStatus] = useState(null); // { type: 'success'|'error'|'info', message }
  const [showCustomHtml, setShowCustomHtml] = useState(false);
  const [customHtml, setCustomHtml] = useState("");
  const [drawerWidth, setDrawerWidth] = useState(560);
  const isResizingRef = useRef(false);

  const webviewRef = useRef(null);
  const iframeRef = useRef(null);
  const isElectron = typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron || window.vooDesktop);

  const navigateTo = useCallback((targetUrl) => {
    let clean = (targetUrl || "").trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean) && !clean.startsWith("about:")) {
      clean = clean.includes(".") ? `https://${clean}` : `https://www.google.com/search?q=${encodeURIComponent(clean)}`;
    }
    setUrl(clean);
    setInputUrl(clean);
    setIsPicking(false);
  }, []);

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    navigateTo(inputUrl);
  };

  // Inject picker helper script into webview or iframe
  const injectPickerScript = useCallback(() => {
    if (isElectron && webviewRef.current) {
      try {
        webviewRef.current.executeJavaScript(INJECTED_PICKER_CODE).catch(() => {});
      } catch {}
    } else if (iframeRef.current?.contentWindow) {
      try {
        const doc = iframeRef.current.contentDocument;
        if (doc) {
          const s = doc.createElement("script");
          s.textContent = INJECTED_PICKER_CODE;
          doc.documentElement.appendChild(s);
        }
      } catch {}
    }
  }, [isElectron]);

  const handleStartPick = () => {
    setIsPicking(true);
    setImportStatus({ type: "info", message: t("browser.pickingHint") || "Click any element in the webpage to import into canvas (ESC to cancel)" });
    injectPickerScript();

    if (isElectron && webviewRef.current) {
      webviewRef.current.executeJavaScript("window.__vooStartPicker?.();").catch(() => {});
    } else if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ action: "start-picker" }, "*");
      } catch {}
    }
  };

  const handleStopPick = () => {
    setIsPicking(false);
    setImportStatus(null);
    if (isElectron && webviewRef.current) {
      webviewRef.current.executeJavaScript("window.__vooStopPicker?.();").catch(() => {});
    } else if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ action: "stop-picker" }, "*");
      } catch {}
    }
  };

  // Full page HTML import
  const handleImportFullPage = async () => {
    setIsLoading(true);
    setImportStatus({ type: "info", message: "Extracting webpage DOM..." });

    try {
      let pageData = null;
      if (isElectron && webviewRef.current) {
        injectPickerScript();
        pageData = await webviewRef.current.executeJavaScript("window.__vooExtractFullPage?.() || { html: document.body.innerHTML, width: window.innerWidth, height: document.body.scrollHeight, title: document.title }");
      } else if (iframeRef.current?.contentDocument) {
        const doc = iframeRef.current.contentDocument;
        pageData = {
          html: doc.body.innerHTML,
          width: Math.max(1080, doc.documentElement.clientWidth || 1080),
          height: Math.max(900, doc.body.scrollHeight || 900),
          title: doc.title || "Webpage",
        };
      }

      if (!pageData?.html) {
        // Fallback: fetch directly
        try {
          const res = await fetch(url);
          const raw = await res.text();
          pageData = { html: raw, width: 1200, height: 900, title: url };
        } catch {
          throw new Error("Could not extract HTML from page. Cross-origin restrictions may apply.");
        }
      }

      const result = await importHtmlSnippetToCanvas({
        html: pageData.html,
        width: pageData.width || 1200,
        height: pageData.height || 900,
        title: pageData.title || "Web Page",
      });

      if (result.success) {
        setImportStatus({ type: "success", message: `Imported ${result.count} layers into canvas!` });
      } else {
        setImportStatus({ type: "error", message: result.error || "Failed to import webpage." });
      }
    } catch (err) {
      setImportStatus({ type: "error", message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Import custom pasted HTML
  const handleImportCustomHtml = async () => {
    if (!customHtml.trim()) return;
    setIsLoading(true);
    const result = await importHtmlSnippetToCanvas({
      html: customHtml,
      width: 800,
      height: 600,
      title: "Custom HTML",
    });
    setIsLoading(false);
    if (result.success) {
      setImportStatus({ type: "success", message: `Imported ${result.count} layers from custom HTML!` });
      setCustomHtml("");
      setShowCustomHtml(false);
    } else {
      setImportStatus({ type: "error", message: result.error });
    }
  };

  // Viewport Screenshot capture fallback
  const handleCaptureViewport = async () => {
    if (isElectron && webviewRef.current) {
      try {
        setIsLoading(true);
        const image = await webviewRef.current.capturePage();
        const dataUrl = image.toDataURL();
        // Insert as an image node
        const editor = window.__vooEditor || Object.values(window.__vooEditors || {})[0];
        if (editor) {
          const size = image.getSize();
          const doc = editor.getDocument();
          const placementX = (doc?.width ? doc.width + 80 : 80);
          const newNode = {
            id: `img-${Date.now()}`,
            name: `Web Snapshot (${new URL(url).hostname})`,
            kind: "image",
            type: "node",
            x: placementX,
            y: 80,
            width: size.width || 800,
            height: size.height || 600,
            imageSrc: dataUrl,
          };
          editor.setDoc({ ...doc, nodes: [...(doc.nodes || []), newNode] }, { name: "Import Web Snapshot" });
          editor.selectExactly?.([newNode.id]);
          setImportStatus({ type: "success", message: "Web snapshot placed on canvas!" });
        }
      } catch (err) {
        setImportStatus({ type: "error", message: `Snapshot failed: ${err.message}` });
      } finally {
        setIsLoading(false);
      }
    } else {
      setImportStatus({ type: "info", message: "Screenshot capture requires Electron desktop client." });
    }
  };

  // Listen for picker message from child window
  useEffect(() => {
    const handleWindowMessage = async (event) => {
      if (event.data?.type === "voo:element-picked") {
        setIsPicking(false);
        setIsLoading(true);
        setImportStatus({ type: "info", message: `Importing ${event.data.title || "element"}...` });

        const result = await importHtmlSnippetToCanvas({
          html: event.data.html,
          width: event.data.width || 400,
          height: event.data.height || 200,
          title: event.data.title || "Web Element",
        });

        setIsLoading(false);
        if (result.success) {
          setImportStatus({ type: "success", message: `Imported element "${event.data.title}" to canvas!` });
        } else {
          setImportStatus({ type: "error", message: result.error });
        }
      } else if (event.data?.type === "voo:picker-cancelled") {
        setIsPicking(false);
        setImportStatus(null);
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, []);

  // Set up webview event listeners in Electron
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const onStart = () => setIsLoading(true);
    const onStop = () => {
      setIsLoading(false);
      injectPickerScript();
    };
    const onNavigate = (e) => {
      setInputUrl(e.url);
      setUrl(e.url);
      setIsPicking(false);
    };
    const onIpcMessage = async (e) => {
      if (e.channel === "voo:element-picked") {
        window.postMessage({ type: "voo:element-picked", ...e.args?.[0] }, "*");
      } else if (e.channel === "voo:picker-cancelled") {
        setIsPicking(false);
        setImportStatus(null);
      }
    };
    const onConsoleMessage = (e) => {
      const msg = e.message || "";
      if (msg.startsWith("__VOO_PICK__:")) {
        try {
          const payload = JSON.parse(msg.slice("__VOO_PICK__:".length));
          window.postMessage(payload, "*");
        } catch {}
      }
    };

    wv.addEventListener("did-start-loading", onStart);
    wv.addEventListener("did-stop-loading", onStop);
    wv.addEventListener("did-navigate", onNavigate);
    wv.addEventListener("ipc-message", onIpcMessage);
    wv.addEventListener("console-message", onConsoleMessage);

    return () => {
      wv.removeEventListener("did-start-loading", onStart);
      wv.removeEventListener("did-stop-loading", onStop);
      wv.removeEventListener("did-navigate", onNavigate);
      wv.removeEventListener("ipc-message", onIpcMessage);
      wv.removeEventListener("console-message", onConsoleMessage);
    };
  }, [injectPickerScript]);

  // Drawer width resize handler
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(380, Math.min(1080, window.innerWidth - e.clientX));
      setDrawerWidth(newWidth);
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  if (!open) return null;

  return (
    <aside
      data-testid="voo-browser-drawer"
      className="fixed right-0 top-10 bottom-0 z-40 flex flex-col border-l border-white/10 bg-neutral-900/95 shadow-panel backdrop-blur-md"
      style={{ width: `${drawerWidth}px` }}
    >
      {/* Left resize handle */}
      <div
        onMouseDown={() => (isResizingRef.current = true)}
        className="absolute -left-1 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-emerald-500/30 transition-colors"
        title="Drag to resize browser"
      />

      {/* Top Browser Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-1.5 border-b border-white/10 bg-neutral-900 px-2 text-xs">
        {/* Navigation controls */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => webviewRef.current?.goBack?.() || iframeRef.current?.contentWindow?.history.back?.()}
            title="Back"
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => webviewRef.current?.goForward?.() || iframeRef.current?.contentWindow?.history.forward?.()}
            title="Forward"
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
            title="Refresh"
            className={`flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors ${isLoading ? "animate-spin text-emerald-400" : ""}`}
          >
            <RotateCw size={13} />
          </button>
          <button
            type="button"
            onClick={() => navigateTo(DEFAULT_HOME_URL)}
            title="Home"
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Home size={13} />
          </button>
        </div>

        {/* Address Bar Form */}
        <form onSubmit={handleUrlSubmit} className="relative flex flex-1 min-w-0 items-center">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder={t("browser.urlPlaceholder") || "Enter URL..."}
            className="h-7 w-full rounded-lg bg-neutral-950 px-2.5 pr-7 text-[11px] font-mono text-neutral-200 outline-none ring-1 ring-white/10 focus:ring-emerald-500/50"
          />
          <button
            type="submit"
            title="Navigate"
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
            title={isPicking ? "Cancel Picking (ESC)" : (t("browser.pickElement") || "Pick Element")}
            className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-all ${
              isPicking
                ? "bg-[#a7ffd4]/20 text-[#a7ffd4] ring-1 ring-[#a7ffd4]/40"
                : "bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <MousePointerClick size={13} />
            <span className="hidden sm:inline">{isPicking ? "Picking..." : (t("browser.pickElement") || "Pick Element")}</span>
          </button>

          <button
            type="button"
            onClick={handleImportFullPage}
            disabled={isLoading}
            title={t("browser.importPage") || "Import Full Page"}
            className="flex h-7 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            <span className="hidden sm:inline">{t("browser.importPage") || "Import Page"}</span>
          </button>

          <button
            type="button"
            onClick={handleCaptureViewport}
            title={t("browser.captureImage") || "Capture Viewport Screenshot"}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Camera size={13} />
          </button>

          <button
            type="button"
            onClick={() => setShowCustomHtml((prev) => !prev)}
            title="Paste & Import Custom HTML"
            className={`flex size-7 items-center justify-center rounded-lg transition-colors ${showCustomHtml ? "bg-white/20 text-white" : "text-neutral-400 hover:bg-white/10 hover:text-white"}`}
          >
            <Code size={13} />
          </button>

          <button
            type="button"
            onClick={() => window.open(url, "_blank")}
            title="Open in default browser"
            className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ExternalLink size={13} />
          </button>

          <div className="h-4 w-px bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={onClose}
            title="Close Browser"
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
            <Sparkles size={13} className="text-[#a7ffd4] animate-spin" />
            <span>Hover and click any element in the webview to import into canvas. Press ESC to cancel.</span>
          </div>
          <button
            type="button"
            onClick={handleStopPick}
            className="rounded-lg bg-neutral-700 px-2.5 py-0.5 text-xs text-neutral-200 hover:bg-neutral-600"
          >
            Cancel
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
            {importStatus.type === "success" && <Check size={13} className="text-emerald-400" />}
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
        <span className="text-neutral-500 font-mono text-[9px] uppercase tracking-wider shrink-0 mr-1">Quick:</span>
        {PRESET_SITES.map((site) => (
          <button
            key={site.name}
            type="button"
            onClick={() => navigateTo(site.url)}
            title={site.desc}
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
            <span>Direct HTML / Component Import</span>
            <button
              type="button"
              onClick={() => setShowCustomHtml(false)}
              className="text-neutral-500 hover:text-neutral-300 text-xs"
            >
              Cancel
            </button>
          </div>
          <textarea
            value={customHtml}
            onChange={(e) => setCustomHtml(e.target.value)}
            placeholder="Paste HTML or SVG code here to import directly into canvas..."
            rows={4}
            className="w-full rounded-lg bg-neutral-950 p-2 text-xs font-mono text-neutral-200 outline-none ring-1 ring-white/10 focus:ring-emerald-500/50"
          />
          <button
            type="button"
            onClick={handleImportCustomHtml}
            disabled={!customHtml.trim() || isLoading}
            className="self-end rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40"
          >
            Convert to Canvas Layers
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
            title="Embedded Web Browser"
            className="h-full w-full border-none bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}
      </div>
    </aside>
  );
}

BrowserDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
