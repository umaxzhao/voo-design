import React from "react";
import { useDesignStore } from "./store/design_store.js";

/** Brand name shown in the title bar. A product name, not translatable copy. */
export const APP_DISPLAY_NAME = "VOO Design";

/** Space kept clear of the native macOS traffic lights (close/minimise/zoom). */
const MAC_TRAFFIC_LIGHT_INSET_PX = 78;

/** Canonical VOO brand hexagon logo with inscribed triangle & circle */
export function VooBrandLogo({ className = "size-4 text-[#a7ffd4]" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 34 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M31.6094 8.5V25.5L16.9336 34L2.25781 25.5V8.5L16.9336 0L31.6094 8.5ZM16.9336 34L31.6094 8.5H2.25781L16.9336 34ZM16.9336 9.16406C21.2246 9.16406 24.7031 12.6723 24.7031 17C24.7031 21.3277 21.2246 24.8359 16.9336 24.8359C12.6426 24.8359 9.16406 21.3277 9.16406 17C9.16406 12.6723 12.6426 9.16406 16.9336 9.16406Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Window title strip.
 * Features the signature VOO emerald green to pitch black gradient.
 */
export default function AppTitleBar() {
  const isMac = window.electronAPI?.platform === "darwin";
  const fileName = useDesignStore((state) => state.fileName) || "Untitled.voo";
  const isDirty = useDesignStore((state) => state.isDirty);
  const welcomeOpen = useDesignStore((state) => state.welcomeOpen);
  const setWelcomeOpen = useDesignStore((state) => state.setWelcomeOpen);

  return (
    <header
      className="app-title-bar flex h-[36px] shrink-0 items-center justify-between px-4 text-xs font-medium tracking-wide text-neutral-400 select-none border-b border-[#a7ffd4]/15"
      style={{
        ...(isMac ? { paddingLeft: MAC_TRAFFIC_LIGHT_INSET_PX } : {}),
        WebkitAppRegion: "drag",
        background: "linear-gradient(90deg, #07382c 0%, #05261e 22%, #0a1713 45%, #000000 100%)",
      }}
    >
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" }}>
        <button
          type="button"
          onClick={() => setWelcomeOpen(!welcomeOpen)}
          className="flex items-center gap-1.5 font-semibold text-white tracking-normal hover:text-[#a7ffd4] transition-colors cursor-pointer rounded-lg px-1.5 py-0.5 hover:bg-white/5"
          title={welcomeOpen ? "返回画布" : "主页 / 欢迎界面"}
        >
          <VooBrandLogo className="size-4 text-[#a7ffd4]" />
          <span>{APP_DISPLAY_NAME}</span>
        </button>

        {!welcomeOpen && (
          <>
            <span className="text-neutral-500">/</span>
            <span className="text-neutral-300 flex items-center gap-1 font-mono text-[11px]">
              {fileName}
              {isDirty && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 ml-0.5"
                  title="未保存更改 (Ctrl+S / ⌘S 保存)"
                />
              )}
            </span>
          </>
        )}
      </div>

      <div
        className="flex items-center gap-2 text-neutral-400 text-[11px]"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("voo:file-save"))}
          className="hover:text-neutral-100 transition-colors cursor-pointer px-2 py-0.5 rounded-lg hover:bg-white/5 text-neutral-300"
          title="保存工程文件 (⌘S / Ctrl+S)"
        >
          保存 (.voo)
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("voo:file-open"))}
          className="hover:text-neutral-100 transition-colors cursor-pointer px-2 py-0.5 rounded-lg hover:bg-white/5 text-neutral-400"
          title="打开工程文件 (⌘O / Ctrl+O)"
        >
          打开
        </button>
      </div>
    </header>
  );
}
