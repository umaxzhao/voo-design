import React from "react";
import PropTypes from "prop-types";
import { SCREENSHOT_ACCEPT } from "../welcome_home_actions.js";

export function WelcomeHiddenInputs({
  fileInputRef,
  screenshotInputRef,
  attachmentInputRef,
  handleOpenLocal,
  handleAttachmentsSelected,
}) {
  return (
    <>
      {/* Hidden file input for file selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".voo,.zip,.psd,.fig,.pen,.svg,application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) await handleOpenLocal(file);
        }}
      />

      <input
        ref={screenshotInputRef}
        type="file"
        accept={SCREENSHOT_ACCEPT}
        className="hidden"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          await handleAttachmentsSelected(files);
          screenshotInputRef.current
            ?.closest(".welcome-dashboard")
            ?.querySelector(".prompt-composer textarea")
            ?.focus();
        }}
      />

      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.voo,.pen,.fig,.svg"
        className="hidden"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files?.length) await handleAttachmentsSelected(files);
        }}
      />
    </>
  );
}

WelcomeHiddenInputs.propTypes = {
  fileInputRef: PropTypes.object.isRequired,
  screenshotInputRef: PropTypes.object.isRequired,
  attachmentInputRef: PropTypes.object.isRequired,
  handleOpenLocal: PropTypes.func.isRequired,
  handleAttachmentsSelected: PropTypes.func.isRequired,
};
