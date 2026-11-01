import React from "react";
import PropTypes from "prop-types";
import { openWelcomeBrowser } from "../welcome_home_actions.js";

export function WelcomeQuickActions({ t, onOpenFigma, onOpenScreenshot }) {
  return (
    <div className="welcome-quick-imports grid grid-cols-1 sm:grid-cols-3 gap-3">
      <button
        type="button"
        onClick={onOpenFigma}
        className="flex min-w-0 items-center justify-center gap-2.5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-700/70 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
      >
        <svg className="size-4 text-neutral-400 group-hover:text-neutral-200 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z" />
          <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z" />
          <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z" />
          <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z" />
          <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z" />
        </svg>
        <span className="whitespace-nowrap">{t("welcome.actions.importFigma")}</span>
      </button>

      <button
        type="button"
        onClick={openWelcomeBrowser}
        className="flex min-w-0 items-center justify-center gap-2.5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-700/70 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
      >
        <svg className="size-4 text-neutral-400 group-hover:text-neutral-200 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="whitespace-nowrap">{t("welcome.actions.importBrowser")}</span>
      </button>

      <button
        type="button"
        onClick={onOpenScreenshot}
        className="flex min-w-0 items-center justify-center gap-2.5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-700/70 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
      >
        <svg className="size-4 text-neutral-400 group-hover:text-neutral-200 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <span className="whitespace-nowrap">{t("welcome.actions.recreateScreenshot")}</span>
      </button>
    </div>
  );
}

WelcomeQuickActions.propTypes = {
  t: PropTypes.func.isRequired,
  onOpenFigma: PropTypes.func.isRequired,
  onOpenScreenshot: PropTypes.func.isRequired,
};
