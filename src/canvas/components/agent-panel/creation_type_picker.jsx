import { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  IconBox3,
  IconChevronLeft,
  IconChevronRight,
  IconCode,
  IconGallery,
  IconImage,
  IconLayout,
  IconSmartphone,
  IconPresentation,
  IconVideo,
  ICON_STROKE_WIDTH,
} from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";
import { useHorizontalWheel } from "../../use_horizontal_wheel.js";
import { CREATION_TYPES } from "./creation-types.js";

const ICON_BY_TYPE = {
  image: IconImage,
  video: IconVideo,
  design: IconLayout,
  html: IconCode,
  "mobile-app": IconSmartphone,
  poster: IconGallery,
  ppt: IconPresentation,
  model3d: IconBox3,
};

export default function CreationTypePicker({
  value,
  onChange,
  disabled = false,
}) {
  const { t } = useI18n();
  const scrollRef = useRef(null);
  const [scrollFade, setScrollFade] = useState("right");

  useHorizontalWheel(scrollRef);

  const updateScrollFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const canScrollLeft = el.scrollLeft > 4;
    const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    if (canScrollLeft && canScrollRight) {
      setScrollFade("both");
    } else if (canScrollLeft) {
      setScrollFade("left");
    } else if (canScrollRight) {
      setScrollFade("right");
    } else {
      setScrollFade("none");
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(updateScrollFade);
    const el = scrollRef.current;
    if (!el) return undefined;

    const onScroll = () => updateScrollFade();
    el.addEventListener("scroll", onScroll, { passive: true });

    if (typeof ResizeObserver === "undefined")
      return () => {
        cancelAnimationFrame(frame);
        el.removeEventListener("scroll", onScroll);
      };
    const ro = new ResizeObserver(() => updateScrollFade());
    ro.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [updateScrollFade]);

  useEffect(() => {
    if (!value || !scrollRef.current) return;
    const itemEl = scrollRef.current.querySelector(
      `[data-testid="creation-type-${value}"]`,
    );
    if (itemEl && typeof itemEl.scrollIntoView === "function") {
      itemEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [value]);

  const move = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.6, 120);
    el.scrollBy({
      left: direction * scrollAmount,
      behavior: "smooth",
    });
  };

  const canScrollLeft = scrollFade === "left" || scrollFade === "both";
  const canScrollRight = scrollFade === "right" || scrollFade === "both";

  const maskImage = {
    right:
      "linear-gradient(to right, black calc(100% - 36px), transparent 100%)",
    both: "linear-gradient(to right, transparent 0%, black 28px, black calc(100% - 36px), transparent 100%)",
    left: "linear-gradient(to right, transparent 0%, black 28px, black 100%)",
    none: "none",
  }[scrollFade];

  return (
    <div
      role="group"
      aria-label={t("agent.creationType.label")}
      data-testid="creation-type-picker"
      className="relative w-full overflow-hidden"
    >
      <ScrollButton
        visible={canScrollLeft}
        direction="previous"
        label={t("agent.creationType.previous")}
        onClick={() => move(-1)}
        testId="creation-type-scroll-prev"
        disabled={disabled}
      />
      <div
        ref={scrollRef}
        className="flex w-full items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      >
        {CREATION_TYPES.map((item) => {
          const Icon = ICON_BY_TYPE[item.id];
          const selected = value === item.id;

          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              data-testid={`creation-type-${item.id}`}
              disabled={disabled}
              onClick={() => onChange(item.id)}
              className={`inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9 ${
                selected
                  ? "bg-white/[0.12] text-neutral-100"
                  : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.1] hover:text-neutral-200"
              }`}
            >
              {Icon && <Icon size={14} strokeWidth={ICON_STROKE_WIDTH} />}
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </div>
      <ScrollButton
        visible={canScrollRight}
        direction="next"
        label={t("agent.creationType.more")}
        onClick={() => move(1)}
        testId="creation-type-scroll-next"
        disabled={disabled}
      />
    </div>
  );
}

function ScrollButton({
  visible,
  direction,
  label,
  onClick,
  testId,
  disabled = false,
}) {
  if (!visible) return null;
  const previous = direction === "previous";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      className={`absolute top-1/2 -translate-y-1/2 z-10 flex h-full w-6 items-center justify-center text-neutral-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#E5B2FF] disabled:cursor-not-allowed disabled:opacity-40 ${
        previous ? "left-0" : "right-0"
      }`}
    >
      {previous ? (
        <IconChevronLeft size={17} strokeWidth={ICON_STROKE_WIDTH} />
      ) : (
        <IconChevronRight size={17} strokeWidth={ICON_STROKE_WIDTH} />
      )}
    </button>
  );
}

CreationTypePicker.propTypes = {
  value: PropTypes.oneOf(CREATION_TYPES.map(({ id }) => id)),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

ScrollButton.propTypes = {
  visible: PropTypes.bool.isRequired,
  direction: PropTypes.oneOf(["previous", "next"]).isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  testId: PropTypes.string,
  disabled: PropTypes.bool,
};
