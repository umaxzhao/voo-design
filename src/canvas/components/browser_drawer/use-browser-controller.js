import { useState, useRef, useEffect, useCallback } from "react";
import { useI18n } from "../../use_i18n.js";
import { importHtmlSnippetToCanvas } from "./browser_import_helpers.js";
import { executeFullPageImport } from "./browser_fullpage_import.js";
import { INJECTED_PICKER_CODE } from "./browser_picker_script.js";
import { DEFAULT_HOME_URL } from "./browser-config.js";

export function useBrowserController(open) {
  const { t } = useI18n();
  const [url, setUrl] = useState(DEFAULT_HOME_URL);
  const [inputUrl, setInputUrl] = useState(DEFAULT_HOME_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [importStatus, setImportStatus] = useState(null); // { type: 'success'|'error'|'info', message }
  const [showCustomHtml, setShowCustomHtml] = useState(false);
  const [customHtml, setCustomHtml] = useState("");
  const webviewRef = useRef(null);
  const iframeRef = useRef(null);
  const isElectron =
    typeof window !== "undefined" &&
    Boolean(window.electronAPI?.isElectron || window.vooDesktop);

  const reportError = useCallback(
    (error) => {
      setIsPicking(false);
      setImportStatus({
        type: "error",
        message: error?.message || t("browser.operationFailed"),
      });
    },
    [t],
  );

  const navigateTo = useCallback((targetUrl) => {
    let clean = (targetUrl || "").trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean) && !clean.startsWith("about:")) {
      clean = clean.includes(".")
        ? `https://${clean}`
        : `https://www.google.com/search?q=${encodeURIComponent(clean)}`;
    }
    setUrl(clean);
    setInputUrl(clean);
    setIsPicking(false);
    setIsLoading(true);
  }, []);

  const handleFrameLoad = useCallback(() => setIsLoading(false), []);
  const handleFrameError = useCallback(() => {
    setIsLoading(false);
    setImportStatus({ type: "error", message: t("browser.loadError") });
  }, [t]);

  useEffect(() => {
    if (open) setIsLoading(true);
  }, [open]);

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    navigateTo(inputUrl);
  };

  const reload = useCallback(() => {
    setIsLoading(true);
    if (webviewRef.current) webviewRef.current.reload();
    else if (iframeRef.current) iframeRef.current.src = url;
  }, [url]);

  // Inject picker helper script into webview or iframe
  const injectPickerScript = useCallback(() => {
    if (isElectron && webviewRef.current) {
      try {
        webviewRef.current
          .executeJavaScript(INJECTED_PICKER_CODE)
          .catch(reportError);
      } catch (error) {
        reportError(error);
      }
    } else if (iframeRef.current?.contentWindow) {
      try {
        const doc = iframeRef.current.contentDocument;
        if (doc) {
          const s = doc.createElement("script");
          s.textContent = INJECTED_PICKER_CODE;
          doc.documentElement.appendChild(s);
        }
      } catch (error) {
        reportError(error);
      }
    }
  }, [isElectron, reportError]);

  const handleStartPick = () => {
    setIsPicking(true);
    setImportStatus({
      type: "info",
      message: t("browser.pickingHint"),
    });
    injectPickerScript();

    if (isElectron && webviewRef.current) {
      webviewRef.current
        .executeJavaScript("window.__vooStartPicker?.();")
        .catch(reportError);
    } else if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { action: "start-picker" },
          "*",
        );
      } catch (error) {
        reportError(error);
      }
    }
  };

  const handleStopPick = () => {
    setIsPicking(false);
    setImportStatus(null);
    if (isElectron && webviewRef.current) {
      webviewRef.current
        .executeJavaScript("window.__vooStopPicker?.();")
        .catch(reportError);
    } else if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { action: "stop-picker" },
          "*",
        );
      } catch (error) {
        reportError(error);
      }
    }
  };

  // Full page HTML import
  const handleImportFullPage = async () => {
    setIsLoading(true);
    setImportStatus({ type: "info", message: t("browser.extracting") });

    try {
      const result = await executeFullPageImport({
        isElectron,
        webviewRef,
        iframeRef,
        injectPickerScript,
        url,
        t,
      });

      if (result.success) {
        setImportStatus({
          type: "success",
          message: t("browser.imported", { count: result.count }),
        });
      } else {
        setImportStatus({
          type: "error",
          message: result.error || t("browser.failed"),
        });
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
      title: t("browser.custom"),
    });
    setIsLoading(false);
    if (result.success) {
      setImportStatus({
        type: "success",
        message: t("browser.imported", { count: result.count }),
      });
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
        const title = t("browser.snapshot", { host: new URL(url).hostname });

        const { prepareImportTargetProject } = await import("./browser_import_target.js");
        const { editor, doc, placement } = await prepareImportTargetProject(title);

        const size = image.getSize();
        const newNode = {
          id: `img-${Date.now()}`,
          name: title,
          kind: "image",
          type: "node",
          x: placement.x,
          y: placement.y,
          width: size.width || 800,
          height: size.height || 600,
          imageSrc: dataUrl,
        };
        editor.setDoc(
          { ...doc, nodes: [...(doc.nodes || []), newNode] },
          { name: "Import Web Snapshot" },
        );
        editor.selectExactly?.([newNode.id]);
        setImportStatus({
          type: "success",
          message: t("browser.snapshotDone"),
        });
      } catch (err) {
        setImportStatus({
          type: "error",
          message: t("browser.snapshotFailed", { error: err.message }),
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      setImportStatus({
        type: "info",
        message: t("browser.desktopCapture"),
      });
    }
  };

  // Listen for picker message from child window
  useEffect(() => {
    const handleWindowMessage = async (event) => {
      if (
        event.source !== window &&
        event.source !== iframeRef.current?.contentWindow
      )
        return;
      if (event.data?.type === "voo:element-picked") {
        setIsPicking(false);
        setIsLoading(true);
        setImportStatus({
          type: "info",
          message: t("browser.importing", {
            title: event.data.title || t("browser.element"),
          }),
        });

        const result = await importHtmlSnippetToCanvas({
          html: event.data.html,
          width: event.data.width || 400,
          height: event.data.height || 200,
          title: event.data.title || t("browser.element"),
        });

        setIsLoading(false);
        if (result.success) {
          setImportStatus({
            type: "success",
            message: t("browser.elementDone", { title: event.data.title }),
          });
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
    const onFail = (event) => {
      setIsLoading(false);
      if (event.errorCode !== -3) {
        setImportStatus({ type: "error", message: t("browser.loadError") });
      }
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
        } catch (error) {
          reportError(error);
        }
      }
    };

    wv.addEventListener("did-start-loading", onStart);
    wv.addEventListener("did-stop-loading", onStop);
    wv.addEventListener("did-fail-load", onFail);
    wv.addEventListener("did-navigate", onNavigate);
    wv.addEventListener("ipc-message", onIpcMessage);
    wv.addEventListener("console-message", onConsoleMessage);

    return () => {
      wv.removeEventListener("did-start-loading", onStart);
      wv.removeEventListener("did-stop-loading", onStop);
      wv.removeEventListener("did-fail-load", onFail);
      wv.removeEventListener("did-navigate", onNavigate);
      wv.removeEventListener("ipc-message", onIpcMessage);
      wv.removeEventListener("console-message", onConsoleMessage);
    };
  }, [injectPickerScript, open, reportError, t]);

  return {
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
    navigateTo,
    handleFrameLoad,
    handleFrameError,
    handleUrlSubmit,
    reload,
    handleStartPick,
    handleStopPick,
    handleImportFullPage,
    handleCaptureViewport,
    handleImportCustomHtml,
  };
}
