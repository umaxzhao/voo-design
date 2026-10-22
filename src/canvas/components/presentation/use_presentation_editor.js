import { useCallback, useEffect, useReducer, useRef } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { buildPresentationPptx } from "../../presentation/presentation-pptx.js";
import { buildPresentationPdf } from "../../presentation/presentation-pdf.js";
import { flushEditorPendingWrites } from "../editor_hooks/editor-autosave.js";
import {
  readPresentationDeck,
  readPresentationPage,
  renderPresentationPage,
  resolvePresentationImage,
} from "./presentation_runtime.js";
import { useI18n } from "../../use_i18n.js";

const initial = { preview: null, busy: false, error: null, warnings: [] };

export function usePresentationEditor({
  ownerId,
  focusedId,
  enginesRef,
  snapshotsRef,
}) {
  const { t } = useI18n();
  const [state, patch] = useReducer(
    (previous, next) => ({ ...previous, ...next }),
    initial,
  );
  const controllerRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);
  const getPageDocument = useCallback(
    (pageId) =>
      readPresentationPage(
        useDesignStore.getState(),
        pageId,
        enginesRef.current,
        snapshotsRef.current,
      ),
    [enginesRef, snapshotsRef],
  );
  const collect = useCallback(
    () =>
      readPresentationDeck(
        useDesignStore.getState(),
        ownerId,
        getPageDocument,
      ),
    [ownerId, getPageDocument],
  );

  useEffect(() => {
    if (!ownerId) return undefined;
    const getPageEngine = async (pageId) => {
      const store = useDesignStore.getState();
      if (!store.editingNodeIds.includes(pageId))
        throw new Error("Page is outside the presentation session");
      store.focusEditorPage(pageId);
      const deadline = Date.now() + 15000;
      while (mountedRef.current && Date.now() < deadline) {
        const current = useDesignStore.getState();
        if (
          current.editingPresentationId !== ownerId ||
          !current.editingNodeIds.includes(pageId)
        )
          break;
        const live = enginesRef.current.get(pageId);
        if (live?.ready) return live.engine;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      throw new Error("Presentation page could not be activated");
    };
    const session = { ownerId, getPageDocument, getPageEngine };
    useDesignStore.setState({ presentationSession: session });
    return () => {
      if (useDesignStore.getState().presentationSession === session)
        useDesignStore.setState({ presentationSession: null });
    };
  }, [ownerId, getPageDocument, enginesRef]);

  const present = useCallback(async () => {
    if (!ownerId) return;
    try {
      for (const value of enginesRef.current.values()) {
        if (value.engine) await flushEditorPendingWrites(value.engine);
      }
      if (!mountedRef.current) return;
      patch({
        preview: { ...collect(), initialPageId: focusedId },
        error: null,
      });
    } catch (error) {
      console.error("Presentation preview failed", error);
      patch({ error: t("presentation.previewFailed") });
    }
  }, [ownerId, collect, focusedId, t, enginesRef]);
  useEffect(() => {
    window.addEventListener("voo:presentation-present", present);
    return () =>
      window.removeEventListener("voo:presentation-present", present);
  }, [present]);

  const pageAction = useCallback(
    async (operation) => {
      try {
        const next = { ...operation };
        if (next.type === "duplicate") {
          const engine = enginesRef.current.get(next.pageId)?.engine;
          await engine?.flushTransforms?.();
          await engine?.flushMasks?.();
          next.doc = getPageDocument(next.pageId);
        }
        if (!useDesignStore.getState().editPresentationPage(ownerId, next))
          throw new Error("Presentation is read-only");
        patch({ error: null });
      } catch (error) {
        console.error("Presentation page update failed", error);
        patch({ error: t("presentation.pageActionFailed") });
      }
    },
    [ownerId, getPageDocument, enginesRef, t],
  );

  const exportDeck = useCallback(
    async (format = "pptx") => {
      if (controllerRef.current) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      patch({ busy: true, error: null, warnings: [] });
      try {
        for (const value of enginesRef.current.values()) {
          await value.engine?.flushTransforms?.();
          await value.engine?.flushMasks?.();
        }
        const deck = collect();
        const presentationCanvases = new Map(
          deck.pages.flatMap((page) =>
            page.doc
              ? [
                  [page.id, page.doc],
                  ...(page.doc.canvasId ? [[page.doc.canvasId, page.doc]] : []),
                ]
              : [],
          ),
        );
        const renderPage = (page) =>
          renderPresentationPage(page, {
            resolveCanvas: (canvasId) =>
              presentationCanvases.get(canvasId) ?? null,
          });
        let blob;
        let warnings = [];
        if (format === "pdf") {
          const result = await buildPresentationPdf(deck, {
            renderPage,
            signal: controller.signal,
          });
          blob = result.blob;
          warnings = result.warnings ?? [];
        } else {
          const result = await buildPresentationPptx(deck, {
            resolveImage: resolvePresentationImage,
            renderPage,
            signal: controller.signal,
          });
          blob = result.blob;
          warnings = result.warnings ?? [];
        }
        controller.signal.throwIfAborted();
        const ext = format === "pdf" ? "pdf" : "pptx";
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${(deck.title || t("presentation.export")).replace(/[\\/:*?"<>|]/g, "-")}.${ext}`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (mountedRef.current)
          patch({
            warnings: warnings.map((warning) => ({
              ...warning,
              title:
                deck.pages.find((page) => page.id === warning.pageId)?.title ||
                t("presentation.page", {
                  number:
                    deck.pages.findIndex((page) => page.id === warning.pageId) +
                    1,
                }),
            })),
          });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Presentation export failed", error);
          if (mountedRef.current)
            patch({ error: t("presentation.exportFailed") });
        }
      } finally {
        controllerRef.current = null;
        if (mountedRef.current) patch({ busy: false });
      }
    },
    [collect, enginesRef, t],
  );
  return {
    ...state,
    present,
    pageAction,
    exportDeck,
    closePreview: () => patch({ preview: null }),
    cancelExport: () => controllerRef.current?.abort(),
  };
}
