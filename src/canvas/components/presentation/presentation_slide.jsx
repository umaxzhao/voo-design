import PropTypes from "prop-types";
import { useCallback, useRef, useState } from "react";
import EditorPage from "../editor_page.jsx";
import { useI18n } from "../../use_i18n.js";

const noop = () => {};

export default function PresentationSlide({
  page,
  index = 0,
  transition = page.transition || page.presentationTransition || "fade",
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const preparedRef = useRef(null);
  const onEngine = useCallback((_id, state) => {
    if (!state.ready || !state.engine || preparedRef.current === state.engine)
      return;
    const engine = state.engine;
    preparedRef.current = engine;
    void engine
      .prepareFrame(0)
      .then(() => {
        if (engine.getDocument().timeline) engine.play();
      })
      .catch(() => setFailed(true));
  }, []);
  return (
    <div
      className="pointer-events-none absolute inset-0 transition-opacity duration-300"
      data-testid="presentation-slide"
      data-presentation-transition={transition}
    >
      <EditorPage
        readOnly
        nodeId={page.id}
        title={page.title || t("presentation.page", { number: index + 1 })}
        index={index}
        focused={false}
        active
        mode="full"
        snapshot={page.doc ? { doc: page.doc } : null}
        onFocus={noop}
        onEngine={onEngine}
        onBeforeDispose={noop}
        onChange={noop}
        onGeneratedOutput={noop}
        onVisibility={noop}
      />
      {failed ? (
        <p
          role="alert"
          className="absolute inset-x-4 bottom-4 text-center text-[11px] text-rose-400"
        >
          {t("presentation.previewFailed")}
        </p>
      ) : null}
    </div>
  );
}
PresentationSlide.propTypes = {
  page: PropTypes.object.isRequired,
  index: PropTypes.number,
  transition: PropTypes.string,
};
