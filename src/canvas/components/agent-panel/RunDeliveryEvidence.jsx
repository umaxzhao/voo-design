/** Read-only file actions and sandboxed HTML layout preview for run history. */

import PropTypes from "prop-types";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../use_i18n.js";
import { extractHtmlSnippet } from "../../editor/streaming_layout_filter.js";
import { sanitizeLayoutHtml } from "../../editor/html_import_style.js";

const FILE_TYPES = new Set(["html", "pptx", "markdown", "mindmap"]);

export default function RunDeliveryEvidence({ item }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(null);
  const [missingFileId, setMissingFileId] = useState(null);
  if (!FILE_TYPES.has(item.mediaType)) return null;

  const previewDocument = preview
    ? `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'"></head><body>${sanitizeLayoutHtml(extractHtmlSnippet(preview.html))}</body></html>`
    : null;

  return (
    <>
      {item.evidence.map((evidence) => (
        <div
          key={`${evidence.changeSetId}:${evidence.resultId ?? evidence.memberNodeId}`}
          className="flex items-center gap-1 text-neutral-500"
        >
          <span className="min-w-0 truncate" title={evidence.name}>
            {evidence.name}
          </span>
          {/* What the file is, when nothing can render it: a pptx, markdown or
              mindmap deliverable is only ever a path on disk. Naming its type
              is the whole card — the hosted editor has no filesystem, so the
              most it can say is what the file was. */}
          <span className="shrink-0 text-neutral-500">
            {evidence.path && !evidence.html
              ? t(`agent.deliverables.type.${item.mediaType}`)
              : t(
                  evidence.path
                    ? "agent.deliverables.fileDelivered"
                    : "agent.deliverables.canvasResult",
                )}
          </span>
          {evidence.html ? (
            <button
              type="button"
              onClick={() =>
                setPreview({ name: evidence.name, html: evidence.html })
              }
              className="shrink-0 rounded-lg px-1 text-[#eed0ff] hover:bg-[#E5B2FF]/10"
            >
              {t("agent.deliverables.preview")}
            </button>
          ) : evidence.path &&
            typeof window !== "undefined" &&
            window.vooElectron?.project?.revealInFinder ? (
            <button
              type="button"
              onClick={async () => {
                const found = await window.vooElectron.project.revealInFinder(
                  evidence.path,
                );
                setMissingFileId(found ? null : evidence.resultId);
              }}
              className="shrink-0 rounded-lg px-1 text-[#eed0ff] hover:bg-[#E5B2FF]/10"
            >
              {t("agent.deliverables.showFile")}
            </button>
          ) : null}
          {missingFileId === evidence.resultId && evidence.path ? (
            <span className="text-amber-400">
              {t("agent.deliverables.fileUnavailable")}
            </span>
          ) : null}
        </div>
      ))}
      {item.generated > 0 &&
      !item.evidence.some((entry) => entry.html || entry.path) ? (
        <p>{t("agent.deliverables.noPreview")}</p>
      ) : null}
      {item.generated === 0 ? (
        <p className="text-neutral-500">{t("agent.deliverables.noFile")}</p>
      ) : null}
      {preview && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("agent.deliverables.previewTitle", {
                name: preview.name,
              })}
              className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            >
              <div className="flex h-[min(75vh,760px)] w-[min(90vw,900px)] flex-col gap-2 rounded-3xl border border-white/10 bg-neutral-900 p-3 shadow-panel">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-neutral-200">
                    {preview.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    aria-label={t("agent.deliverables.closePreview")}
                    className="rounded-lg px-2 py-1 text-xs text-neutral-300 hover:bg-white/10"
                  >
                    {t("agent.deliverables.closePreview")}
                  </button>
                </div>
                <iframe
                  title={t("agent.deliverables.previewTitle", {
                    name: preview.name,
                  })}
                  sandbox=""
                  srcDoc={previewDocument}
                  className="min-h-0 flex-1 rounded-xl bg-white"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

RunDeliveryEvidence.propTypes = { item: PropTypes.object.isRequired };
