import PropTypes from "prop-types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Copy, Download, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { buildScene } from "../codegen/model.js";
import {
  CODEGEN_FORMATS,
  generateCode,
} from "../codegen/index.js";
import { getImageBlobMap } from "../store/db.js";
import { useExportDialogKeyboard } from "./editor_hooks/use_export_dialog_keyboard.js";

const FORMAT_LABELS = Object.freeze({
  html: ["editor.codegen.format.tailwind", "HTML + Tailwind"],
  react: ["editor.codegen.format.react", "React"],
  css: ["editor.codegen.format.css", "Plain CSS"],
});

const MIME_TYPES = Object.freeze({
  html: "text/html",
  react: "text/javascript",
  css: "text/css",
});

/**
 * Returns a translated label, or the English fallback while the codegen
 * dictionary slice is not wired into the active locale yet.
 */
export function tOr(t, key, fallback, params = null) {
  const value = t(key, params ?? undefined);
  return value === key ? fallback : value;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Resolves the persisted image bytes the exporter needs, exactly like the HTML
 * clipboard path: data URLs for `src` and intrinsic pixel sizes for crops.
 * Shared with the context menu's "Copy code" action.
 */
export async function resolveCodegenAssets(
  doc,
  { selectedIds = null, scope = "selection" } = {},
) {
  if (!doc) return { imageSources: null, imageSizes: null };
  let scene;
  try {
    scene = buildScene(doc, { selectedIds, scope });
  } catch {
    return { imageSources: null, imageSizes: null };
  }
  const imageIds = [
    ...new Set(
      scene.nodes
        .filter((node) => node.kind === "image" && node.imageId)
        .map((node) => node.imageId),
    ),
  ];
  if (imageIds.length === 0) return { imageSources: null, imageSizes: null };
  let blobs = new Map();
  try {
    blobs = await getImageBlobMap(imageIds);
  } catch {
    blobs = new Map();
  }
  const imageSources = new Map();
  const imageSizes = new Map();
  await Promise.all(
    [...blobs].map(async ([imageId, blob]) => {
      try {
        imageSources.set(imageId, await blobToDataUrl(blob));
      } catch {
        // An unreadable blob stays missing; the exporter reports the placeholder.
      }
      if (typeof createImageBitmap === "function") {
        try {
          const bitmap = await createImageBitmap(blob);
          imageSizes.set(imageId, {
            width: bitmap.width,
            height: bitmap.height,
          });
          bitmap.close?.();
        } catch {
          // Crop falls back to the layer box and reports the approximation.
        }
      }
    }),
  );
  return { imageSources, imageSizes };
}

function ScopeToggle({ scope, selectedCount, onScope, t }) {
  const scopes = [
    ["selection", "editor.codegen.scope.selection", "Selection"],
    ["page", "editor.codegen.scope.page", "Page"],
  ];
  return (
    <div
      role="radiogroup"
      aria-label={tOr(t, "editor.codegen.scope", "Scope")}
      className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5"
    >
      {scopes.map(([value, key, fallback]) => {
        const disabled = value === "selection" && selectedCount === 0;
        const active = scope === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onScope(value)}
            className={`min-h-6 rounded-md px-2 text-[10px] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-default disabled:opacity-40 ${
              active
                ? "bg-white/[0.12] text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {tOr(t, key, fallback)}
          </button>
        );
      })}
    </div>
  );
}

ScopeToggle.propTypes = {
  scope: PropTypes.string.isRequired,
  selectedCount: PropTypes.number.isRequired,
  onScope: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};

function WarningRail({ warnings, t }) {
  return (
    <aside
      aria-label={tOr(t, "editor.codegen.warnings", "Warnings")}
      className="ui-scroll flex min-h-0 flex-col gap-1.5 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
    >
      <span className="text-[10px] text-neutral-400">
        {tOr(t, "editor.codegen.warnings", "Warnings")}
        {warnings.length > 0 ? ` (${warnings.length})` : ""}
      </span>
      {warnings.length === 0 ? (
        <span className="text-[10px] leading-[1.5] text-neutral-500">
          {tOr(t, "editor.codegen.noWarnings", "No lossy layers")}
        </span>
      ) : (
        warnings.map((warning) => {
          const message = tOr(
            t,
            `editor.codegen.warn.${warning.code}`,
            warning.message,
            warning.nodeName ? { name: warning.nodeName } : null,
          );
          return (
            <p
              key={`${warning.code}:${warning.nodeId ?? "document"}`}
              className="flex gap-1.5 text-[10px] leading-[1.5] text-amber-300/90"
            >
              <AlertTriangle
                size={10}
                strokeWidth={1.5}
                aria-hidden="true"
                className="mt-0.5 flex-none text-neutral-400"
              />
              <span className="min-w-0">
                {message}
                {warning.nodeName ? (
                  <span className="text-neutral-500">
                    {" "}
                    {warning.nodeName}
                  </span>
                ) : null}
              </span>
            </p>
          );
        })
      )}
    </aside>
  );
}

WarningRail.propTypes = {
  warnings: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      nodeId: PropTypes.string,
      nodeName: PropTypes.string,
      message: PropTypes.string.isRequired,
    }),
  ).isRequired,
  t: PropTypes.func.isRequired,
};

/**
 * "Export design to code" dialog: format tabs, selection/page scope, a
 * monospace preview with copy/download, and a rail of lossy-export warnings.
 *
 * Mounted from the canvas context menu through a portal, so the context menu
 * and the dialog stay independent overlays.
 */
export default function EditorCodeExportDialog({
  doc = null,
  selectedIds = [],
  selectedCount = 0,
  onClose,
}) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const resetTimerRef = useRef(null);
  const [format, setFormat] = useState("html");
  const [scope, setScope] = useState(selectedCount > 0 ? "selection" : "page");
  const [assets, setAssets] = useState({ imageSources: null, imageSizes: null });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  useExportDialogKeyboard(dialogRef, onClose);

  // The engine hands out a fresh selection array on every editor render; key the
  // effects by content so identical selections do not reload assets per frame.
  const selectionKey = selectedIds.join("|");
  const stableSelectedIds = useMemo(() => selectedIds, [selectionKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    resolveCodegenAssets(doc, { selectedIds: stableSelectedIds, scope })
      .then((resolved) => {
        if (cancelled) return;
        setAssets(resolved);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, stableSelectedIds, scope]);

  useEffect(
    () => () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const result = useMemo(() => {
    try {
      return generateCode({
        doc,
        selectedIds: stableSelectedIds,
        format,
        scope,
        imageSources: assets.imageSources,
        imageSizes: assets.imageSizes,
      });
    } catch (error) {
      return { error };
    }
  }, [doc, stableSelectedIds, format, scope, assets]);

  const close = useCallback(() => onClose?.(), [onClose]);

  const flashCopied = (failed) => {
    setCopied(!failed);
    setCopyFailed(failed);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 1600);
  };

  const copyCode = async () => {
    if (!result || result.error) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no-clipboard");
      await navigator.clipboard.writeText(result.code);
      flashCopied(false);
    } catch {
      flashCopied(true);
    }
  };

  const downloadCode = () => {
    if (!result || result.error) return;
    const blob = new Blob([result.code], {
      type: `${MIME_TYPES[format] ?? "text/plain"};charset=utf-8`,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const disabled = loading || Boolean(result?.error);
  const warningCount = result?.warnings?.length ?? 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-export-title"
        data-testid="code-export-dialog"
        className="flex max-h-[calc(100dvh-48px)] w-[min(960px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/95 font-mono shadow-panel backdrop-blur"
      >
        <header className="flex items-start justify-between gap-4 px-4 pt-4">
          <div className="min-w-0">
            <h2
              id="code-export-title"
              className="text-[12px] text-neutral-100"
            >
              {tOr(t, "editor.codegen.title", "Export code")}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={tOr(t, "editor.codegen.close", "Close")}
            className="flex size-6 flex-none items-center justify-center rounded-lg text-neutral-400 transition-colors outline-none hover:bg-white/[0.08] hover:text-white focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          >
            <X size={12} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
          <div
            role="radiogroup"
            aria-label={tOr(t, "editor.codegen.format", "Format")}
            className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5"
          >
            {CODEGEN_FORMATS.map((value) => {
              const [key, fallback] = FORMAT_LABELS[value];
              const active = format === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFormat(value)}
                  className={`min-h-6 rounded-md px-2 text-[10px] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                    active
                      ? "bg-white/[0.12] text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {tOr(t, key, fallback)}
                </button>
              );
            })}
          </div>
          <ScopeToggle
            scope={scope}
            selectedCount={selectedCount}
            onScope={setScope}
            t={t}
          />
        </div>

        <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_232px]">
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
              <div className="min-w-0">
                <p
                  className="truncate text-[10px] text-neutral-300"
                  data-testid="code-export-file-name"
                  title={result?.fileName ?? ""}
                >
                  {result?.fileName ?? "-"}
                </p>
                <p className="text-[9px] text-neutral-500">
                  {scope === "selection"
                    ? `${selectedCount} ${tOr(t, "editor.codegen.layers", "layers")}`
                    : tOr(t, "editor.codegen.wholePage", "Whole page")}
                  {warningCount > 0 ? ` / ${warningCount}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={downloadCode}
                  disabled={disabled}
                  className="flex min-h-6 items-center gap-1 rounded-lg bg-white/[0.06] px-2 text-[10px] text-neutral-200 transition-colors outline-none hover:bg-white/[0.12] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-default disabled:opacity-40"
                >
                  <Download size={10} strokeWidth={1.5} aria-hidden="true" />
                  {tOr(t, "editor.codegen.download", "Download")}
                </button>
                <button
                  type="button"
                  onClick={copyCode}
                  disabled={disabled}
                  aria-live="polite"
                  className="flex min-h-6 items-center gap-1 rounded-lg bg-white px-2 text-[10px] font-medium text-black transition-colors outline-none hover:bg-neutral-200 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-default disabled:opacity-40"
                >
                  {copied ? (
                    <Check size={10} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Copy size={10} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  {copied
                    ? tOr(t, "editor.codegen.copied", "Copied")
                    : copyFailed
                      ? tOr(t, "editor.codegen.copyFailed", "Copy failed")
                      : tOr(t, "editor.codegen.copy", "Copy code")}
                </button>
              </div>
            </div>
            <pre
              tabIndex={0}
              aria-label={tOr(t, "editor.codegen.preview", "Code preview")}
              data-testid="code-export-preview"
              className="ui-scroll min-h-0 flex-1 overflow-auto whitespace-pre p-3 text-[10px] leading-[1.6] text-neutral-300 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
            >
              {result?.error
                ? tOr(
                    t,
                    "editor.codegen.error",
                    "This document could not be exported.",
                  )
                : loading
                  ? tOr(t, "editor.codegen.resolving", "Resolving image assets...")
                  : result.code}
            </pre>
          </div>
          <WarningRail warnings={result?.warnings ?? []} t={t} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

EditorCodeExportDialog.propTypes = {
  doc: PropTypes.object,
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  selectedCount: PropTypes.number,
  onClose: PropTypes.func.isRequired,
};
