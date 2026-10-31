import AnchoredGlobalPopover from "./anchored_global_popover.jsx";
import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { initialsFor } from "../collab/presence.js";
import {
  avatarUrl,
  loadIdentity,
  randomSeed,
  saveIdentity,
} from "../collab/identity.js";
import { IconAdd, ICON_STROKE_WIDTH } from "../icons.jsx";
import { STATUS } from "../collab/session.js";
import {
  setCollabAccess,
  setCollabIdentity,
  stopCollab,
  useCollabState,
} from "../collab/use_collab.js";
import { useDesignStore } from "../../store/design_store.js";
import { exportRoomSnapshot } from "../store/share_actions.js";
import { useI18n } from "../use_i18n.js";

const MAX_FACES = 4;

function Avatar({ peer, index, size = 22 }) {
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  const label = peer.name || t("collab.anonymous");
  return (
    <span
      title={peer.self ? `${label} (${t("collab.you")})` : label}
      style={{
        background: peer.colour,
        width: size,
        height: size,
        marginLeft: index === 0 ? 0 : -6,
        zIndex: MAX_FACES - index,
        fontSize: Math.max(11, Math.round(size * 0.4)),
      }}
      className="relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium text-black"
    >
      {initialsFor(label)}
      {peer.avatarSeed && !broken ? (
        <img
          src={avatarUrl(peer.avatarSeed)}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </span>
  );
}

Avatar.propTypes = {
  peer: PropTypes.shape({
    name: PropTypes.string,
    colour: PropTypes.string,
    avatarSeed: PropTypes.string,
    self: PropTypes.bool,
    transport: PropTypes.string,
  }).isRequired,
  index: PropTypes.number.isRequired,
  size: PropTypes.number,
};

export default function CollabAvatars({
  state: propState,
  onStop: propOnStop,
  onIdentity: propOnIdentity,
}) {
  const { t } = useI18n();
  const liveCollabState = useCollabState();
  const state = propState ?? liveCollabState;
  const onStop = propOnStop ?? stopCollab;
  const onIdentity = propOnIdentity ?? setCollabIdentity;

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [identity, setIdentity] = useState(loadIdentity);
  const [explained, setExplained] = useState(false);
  const [sharedLink, setSharedLink] = useState(null);
  const [access, setAccess] = useState(state?.access ?? "edit");
  const boxRef = useRef(null);
  const popoverRef = useRef(null);

  const storeShareWorkflow = useDesignStore((store) => store.shareWorkflow);
  const shareError = useDesignStore((store) => store.shareError);
  const clearShareError = useDesignStore((store) => store.clearShareError);

  const updateIdentity = (patch) => {
    setIdentity((current) => {
      const next = { ...current, ...patch };
      saveIdentity(next);
      onIdentity?.(next);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    setIdentity(loadIdentity());
    const onDown = (event) => {
      if (!boxRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    setSharedLink(null);
  }, [state?.roomId]);

  useEffect(() => {
    setAccess(state?.access ?? "edit");
  }, [state?.access]);

  const live = state?.status !== STATUS.OFF;
  const peers = state?.peers ?? [];
  const faces = peers.slice(0, MAX_FACES);
  const overflow = peers.length - faces.length;

  const copyLink = async () => {
    clearShareError?.();
    const shareFn = storeShareWorkflow || (await import("../store/share_actions.js")).shareWorkflow;
    const link = await shareFn(access);
    if (!link) return;
    setSharedLink(link);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Manual copy fallback
    }
  };

  const applyAccess = (next) => {
    setAccess(next);
    setCollabAccess(next);
  };

  return (
    <div ref={boxRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={live ? t("collab.sharing") : t("collab.share")}
        title={live ? t("collab.sharing") : t("collab.share")}
        // 28px hit area; the title bar is a drag region, so the button opts out.
        style={{ WebkitAppRegion: "no-drag" }}
        className="group flex h-7 items-center rounded-xl px-1 transition-colors hover:bg-white/[0.06] focus-visible:outline-none"
      >
        {faces.map((peer, index) => (
          <Avatar key={peer.peerId} peer={peer} index={index} />
        ))}
        {overflow > 0 ? (
          <span
            style={{ marginLeft: -6 }}
            className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-neutral-800 px-1 text-[11px] font-medium text-neutral-200"
          >
            +{overflow}
          </span>
        ) : null}
        <span
          style={{ marginLeft: faces.length || overflow ? -6 : 0 }}
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 transition-colors group-hover:bg-neutral-700 group-hover:text-white"
        >
          <IconAdd size={11} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        </span>
      </button>

      {open ? (
        <AnchoredGlobalPopover anchorRef={boxRef} surfaceRef={popoverRef}
          label={t("collab.share")}
          className="rounded-2xl border border-white/10 bg-neutral-900 p-3.5 shadow-panel"
        >
          <div className="mb-2.5 flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-neutral-100">
              {t("collab.title")}
            </span>
            <button
              type="button"
              onClick={() => setExplained((shown) => !shown)}
              aria-expanded={explained}
              aria-label={t("collab.whatIsThis")}
              className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-medium text-neutral-400 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none"
            >
              ?
            </button>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateIdentity({ avatarSeed: randomSeed() })}
              title={t("collab.shuffleAvatar")}
              className="shrink-0 rounded-full transition-transform hover:opacity-80 focus-visible:outline-none"
            >
              <Avatar
                peer={{ name: identity.name, colour: "#525252", avatarSeed: identity.avatarSeed, self: true }}
                index={0}
                size={30}
              />
            </button>
            <input
              value={identity.name || ""}
              onChange={(event) => updateIdentity({ name: event.target.value })}
              placeholder={t("collab.namePlaceholder")}
              maxLength={24}
              aria-label={t("collab.nameLabel")}
              className="min-w-0 flex-1 rounded-xl bg-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
            />
          </div>

          {explained ? (
            <p className="mb-3 text-[11px] leading-relaxed text-neutral-400">
              {t("collab.explainer")}
            </p>
          ) : null}

          {!state?.joinedViaLink ? (
            <div className="mb-2.5 flex items-center gap-2">
              <span className="shrink-0 text-[11px] text-neutral-400">
                {t("collab.accessLabel")}
              </span>
              <div className="flex flex-1 overflow-hidden rounded-lg bg-neutral-800 p-0.5">
                <button
                  type="button"
                  onClick={() => applyAccess("edit")}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none ${
                    access === "edit" ? "bg-white/10 font-medium text-white" : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {t("collab.accessEdit")}
                </button>
                <button
                  type="button"
                  onClick={() => applyAccess("view")}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none ${
                    access === "view" ? "bg-white/10 font-medium text-white" : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {t("collab.accessView")}
                </button>
              </div>
            </div>
          ) : null}

          {state?.readOnly ? (
            <p className="mb-2.5 text-[11px] text-[#eed0ff]">
              {t("collab.readOnlyBody")}
            </p>
          ) : null}

          <div className="mb-2.5 flex items-center gap-1.5">
            <input
              readOnly
              value={sharedLink ?? ""}
              placeholder={t("collab.linkPending")}
              onFocus={(event) => event.target.select()}
              aria-label={t("collab.link")}
              className="min-w-0 flex-1 rounded-xl bg-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-400"
            />
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition-opacity hover:opacity-90 active:scale-95 focus-visible:outline-none"
            >
              {copied ? t("collab.copied") : t("collab.copy")}
            </button>
          </div>

          {shareError ? (
            <p className="mb-2 text-[11px] text-rose-300">
              {t("share.failed")}
            </p>
          ) : null}

          <ul className="mb-2 flex flex-col gap-1">
            {peers.map((peer) => (
              <li key={peer.peerId} className="flex items-center gap-2 text-[11px] text-neutral-300">
                <span style={{ background: peer.colour }} className="h-1.5 w-1.5 shrink-0 rounded-full" />
                <span className="truncate">{peer.name || t("collab.anonymous")}</span>
                {peer.self ? (
                  <span className="text-neutral-400">{t("collab.you")}</span>
                ) : peer.transport ? (
                  <span
                    title={peer.transport === "relay" ? t("collab.relayedHint") : t("collab.directHint")}
                    className={peer.transport === "relay" ? "shrink-0 text-[9px] text-[#eed0ff]" : "shrink-0 text-[9px] text-emerald-400"}
                  >
                    {peer.transport === "relay" ? t("collab.relayed") : t("collab.direct")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => {
              void exportRoomSnapshot().catch((error) => console.warn("Room snapshot failed", error));
            }}
            className="mb-2 w-full rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-[11px] text-neutral-300 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none"
          >
            {t("collab.saveSnapshot")}
          </button>

          {state?.status === STATUS.CONNECTING && (
            <p className="text-[11px] text-neutral-400">{t("collab.connecting")}</p>
          )}
          {state?.imageProgress && (
            <p className="text-[11px] text-neutral-400">
              {t("collab.receiving", { done: state.imageProgress.done, total: state.imageProgress.total })}
            </p>
          )}
          {state?.status === STATUS.FAILED && (
            <p className="text-[11px] text-rose-400">
              {state?.error === "timeout" ? t("collab.timeout") : t("collab.failed")}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              onStop?.();
              setOpen(false);
            }}
            className="mt-1 w-full rounded-xl bg-white/[0.06] py-1.5 text-[11px] text-neutral-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none"
          >
            {t("collab.stop")}
          </button>
        </AnchoredGlobalPopover>
      ) : null}
    </div>
  );
}

CollabAvatars.propTypes = {
  onIdentity: PropTypes.func,
  state: PropTypes.shape({
    status: PropTypes.string,
    roomId: PropTypes.string,
    link: PropTypes.string,
    access: PropTypes.string,
    joinedViaLink: PropTypes.bool,
    readOnly: PropTypes.bool,
    error: PropTypes.string,
    peers: PropTypes.array,
    imageProgress: PropTypes.shape({
      done: PropTypes.number.isRequired,
      total: PropTypes.number.isRequired,
    }),
  }),
  onStop: PropTypes.func,
};
