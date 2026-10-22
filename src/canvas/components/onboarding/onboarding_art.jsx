import PropTypes from "prop-types";
import { useState } from "react";
import { assetUrl } from "../../asset_url.js";

/**
 * The guide's cover plate has independent background and logo layers. The
 * background fills the decorative column (cover fit: edges cropped); the logo
 * stays fixed above it when a step image changes or a carousel is added.
 *
 * The art is decorative. It is `aria-hidden` and contributes no control, so it
 * is outside the dialog's focus order and the focus trap has nothing to trip
 * over; a screen reader gets the step's question and its choices, which is the
 * whole of what the plate illustrates.
 *
 * Layout before the image, not after it: the column is sized by the dialog, so
 * the panel is the right size on first paint and the picture lands inside a
 * box that was already there. A slow image therefore cannot move anything,
 * and a missing one leaves the dark surface and the logo visible. A broken
 * background image is dropped on `onError`.
 *
 * The surface is one step brighter than the modal. Depth comes from lightness,
 * not from an outline (Design.md §0.1), so the plate reads as part of the shell
 * rather than as a hole cut in it.
 */
export default function OnboardingArt({ name, className = "" }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      aria-hidden="true"
      data-testid="onboarding-art"
      className={`relative overflow-hidden bg-[#1c1c1c] ${className}`}
    >
      <div data-testid="onboarding-art-fill" className="absolute inset-0">
        {name && !failed ? (
          <img
            data-testid="onboarding-art-image"
            src={assetUrl(name)}
            alt=""
            decoding="async"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div
        data-testid="onboarding-art-logo"
        className="pointer-events-none absolute bottom-6 right-8 flex items-center gap-2.5"
      >
        <img src={assetUrl("onboarding/cover-logo.svg")} alt="" decoding="async" className="h-7 w-auto" />
        <span className="text-[15px] font-semibold tracking-wide text-white">VOO Design</span>
      </div>
    </div>
  );
}

OnboardingArt.propTypes = {
  /** Public-directory path of this step's background, or null for the dark surface. */
  name: PropTypes.string,
  className: PropTypes.string,
};
