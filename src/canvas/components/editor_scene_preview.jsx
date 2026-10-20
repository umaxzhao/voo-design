import PropTypes from "prop-types";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { IconPause, IconPlay, IconClose } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import { effectivePage } from "../editor/scene_model_geometry.js";
import { hasPreviewPlayback } from "../editor/preview-playback.js";

const EditorPage = lazy(() => import("./editor_page.jsx"));

const NOOP = () => {};

export default function EditorScenePreview({
  nodeId,
  title,
  snapshot,
  html,
  onClose,
}) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const pageBounds = snapshot?.doc ? effectivePage(snapshot.doc) : null;
  const [engine, setEngine] = useState(null);
  const [playback, setPlayback] = useState({
    time: 0,
    duration: 0,
    fps: 30,
    playing: false,
  });
  const [hasMediaError, setHasMediaError] = useState(false);
  const canPlay =
    !html &&
    Boolean(engine) &&
    playback.duration > 0 &&
    hasPreviewPlayback(engine.getDocument?.() ?? snapshot?.doc, (id) =>
      engine.getMediaPlaybackMetadata?.(id),
    );

  const syncEngine = useCallback((_nodeId, next) => {
    // Workflow Space loads its document in EditorPage without a snapshot.
    // Wait for that real document, never classify the engine's placeholder.
    const readyEngine = next.ready ? next.engine : null;
    setEngine(readyEngine ?? null);
    setHasMediaError(
      Object.keys(next.engine?.getMediaErrors?.() ?? {}).length > 0,
    );
    const state = readyEngine?.getPlaybackState?.();
    if (state) setPlayback(state);
  }, []);

  const refreshPlayback = useCallback(() => {
    const state = engine?.getPlaybackState?.();
    if (state) setPlayback(state);
    setHasMediaError(Object.keys(engine?.getMediaErrors?.() ?? {}).length > 0);
  }, [engine]);

  const seek = async (seconds) => {
    if (!engine) return;
    try {
      await engine.prepareFrame(seconds);
      refreshPlayback();
    } catch {
      setHasMediaError(true);
    }
  };

  const closeOnEscape = useCallback(
    (event) => {
      if (event.key !== "Escape" && event.key !== " ") return;
      if (
        event.key === " " &&
        event.target?.closest?.(
          "input, textarea, button, select, [contenteditable='true']",
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [closeOnEscape]);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  useEffect(() => {
    return () => engine?.pause?.();
  }, [engine]);

  useEffect(() => {
    if (!engine || html) return undefined;
    let cancelled = false;
    void engine
      .prepareFrame(0)
      .then(() => {
        if (!cancelled) refreshPlayback();
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Scene preview first frame failed", error);
        setHasMediaError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [engine, html, refreshPlayback]);

  const content = (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
      data-testid="lightbox-dialog"
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("editor.preview.title")}
        className="flex h-[min(86vh,52rem)] w-[min(92vw,76rem)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#141414] text-neutral-200 shadow-panel"
        onKeyDownCapture={(event) => {
          if (event.key === "Tab") {
            const controls = [
              ...event.currentTarget.querySelectorAll(
                "button:not(:disabled), input:not(:disabled), [tabindex='0']",
              ),
            ];
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialogRef.current)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
          if (event.key === " ") event.stopPropagation();
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <h2 className="min-w-0 truncate text-[12px] text-neutral-100">
            {title || t("editor.preview.title")}
          </h2>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label={t("editor.preview.close")}
            title={t("editor.preview.close")}
            onClick={onClose}
          >
            <IconClose size={16} strokeWidth={1.5} />
          </button>
        </header>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          {html ? (
            <div
              data-testid="editor-html-viewport"
              tabIndex={0}
              aria-label={t("editor.preview.title")}
              className="ui-scroll absolute inset-0 overflow-auto bg-neutral-900"
            >
              {/* The host owns scrolling and keys; scene HTML keeps an opaque sandbox. */}
              <iframe
                data-testid="editor-html-preview"
                title={title || t("editor.preview.title")}
                className="pointer-events-none block min-w-full border-0 bg-white"
                sandbox=""
                tabIndex={-1}
                style={{
                  width: pageBounds?.width ?? "100%",
                  height: pageBounds?.height ?? "100%",
                }}
                srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline'; font-src data:"><style>html,body{margin:0;min-height:100%;}body{display:flex;justify-content:center;}</style></head><body>${html}</body></html>`}
              />
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0">
              <Suspense fallback={null}>
                <EditorPage
                  readOnly
                  nodeId={nodeId}
                  snapshot={snapshot}
                  title={title || t("editor.preview.title")}
                  index={0}
                  focused={false}
                  active
                  mode="full"
                  onFocus={NOOP}
                  onEngine={syncEngine}
                  onBeforeDispose={NOOP}
                  onChange={refreshPlayback}
                  onGeneratedOutput={NOOP}
                  onVisibility={NOOP}
                />
              </Suspense>
            </div>
          )}
        </div>
        {hasMediaError ? (
          <p
            role="alert"
            className="shrink-0 px-4 py-3 text-[10px] text-rose-400"
          >
            {t("editor.preview.mediaError")}
          </p>
        ) : null}
        {canPlay ? (
          <footer className="flex shrink-0 items-center gap-3 px-4 py-3">
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
              disabled={!engine}
              aria-label={t(
                playback.playing
                  ? "editor.preview.pause"
                  : "editor.preview.play",
              )}
              title={t(
                playback.playing
                  ? "editor.preview.pause"
                  : "editor.preview.play",
              )}
              onClick={() => {
                if (playback.playing) engine?.pause?.();
                else engine?.play?.();
                refreshPlayback();
              }}
            >
              {playback.playing ? (
                <IconPause size={15} />
              ) : (
                <IconPlay size={15} />
              )}
            </button>
            <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">
              {playback.time.toFixed(2)} / {playback.duration.toFixed(2)}
            </span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t("editor.preview.time")}</span>
              <input
                type="range"
                className="flat-range h-5 w-full"
                min={0}
                max={playback.duration}
                step={1 / playback.fps}
                value={Math.min(playback.duration, playback.time)}
                aria-label={t("editor.preview.time")}
                onChange={(event) => void seek(Number(event.target.value))}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </label>
          </footer>
        ) : null}
      </section>
    </div>
  );

  return createPortal(content, document.body);
}

EditorScenePreview.propTypes = {
  nodeId: PropTypes.string.isRequired,
  title: PropTypes.string,
  snapshot: PropTypes.object,
  html: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};
