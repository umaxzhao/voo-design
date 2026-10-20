import PropTypes from "prop-types";
import { useState } from "react";
import { useWorkflowStore } from "../../store/workflow_store.js";
import { useI18n } from "../../use_i18n.js";
import PresentationViewer from "./presentation_viewer.jsx";
import PresentationSlide from "./presentation_slide.jsx";
import {
  readPresentationDeck,
  readPresentationPage,
} from "./presentation_runtime.js";

/** Capture once: presentation navigation never changes the editor's current page. */
export default function PresentationNodePreview({ ownerId, onClose }) {
  const { t } = useI18n();
  const [snapshot] = useState(() => {
    try {
      const store = useWorkflowStore.getState();
      const session = store.presentationSession;
      return readPresentationDeck(store, ownerId, (pageId) =>
        session?.ownerId === ownerId
          ? session.getPageDocument(pageId)
          : readPresentationPage(store, pageId),
      );
    } catch (error) {
      console.error("Presentation preview failed", error);
      return null;
    }
  });
  if (!snapshot)
    return (
      <div
        data-presentation-overlay
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-black text-neutral-100"
      >
        <p role="alert">{t("presentation.previewFailed")}</p>
        <button type="button" onClick={onClose}>
          {t("presentation.viewer.close")}
        </button>
      </div>
    );
  return (
    <PresentationViewer
      pages={snapshot.pages}
      title={snapshot.title}
      onClose={onClose}
      renderSlide={(page, index) => (
        <PresentationSlide key={page.id} page={page} index={index} />
      )}
    />
  );
}

PresentationNodePreview.propTypes = {
  ownerId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};
