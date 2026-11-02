import PropTypes from "prop-types";
import { Send } from "lucide-react";
import { avatarUrl } from "../collab/identity.js";

import { label } from "./comment_label.js";
export { label } from "./comment_label.js";

export function clampSize(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function authorName(author, t) {
  const name = typeof author?.name === "string" ? author.name.trim() : "";
  return name || label(t, "editor.comments.authorFallback", "You");
}

function authorSeed(author) {
  return (
    (typeof author?.avatarSeed === "string" && author.avatarSeed.trim()) ||
    (typeof author?.id === "string" && author.id.trim()) ||
    (typeof author?.name === "string" && author.name.trim()) ||
    "guest"
  );
}

function initialOf(author, t) {
  const name = authorName(author, t).trim();
  return name ? name.slice(0, 1).toUpperCase() : "?";
}

export function formatWhen(value) {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return "";
  }
}

export function pointText(body, limit = 60) {
  const text = typeof body === "string" ? body.replace(/\s+/g, " ").trim() : "";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Avatar with a rendered initial underneath, so a blocked network still reads. */
export function CommentAvatar({ author, size = 20, t = null }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-[11px] leading-none text-neutral-300"
      style={{ width: size, height: size }}
    >
      {initialOf(author, t)}
      <img
        src={avatarUrl(authorSeed(author))}
        alt=""
        draggable={false}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}

export function PostButton({ disabled, label: text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-lg bg-[#a7ffd4] px-2 py-1 text-[10px] leading-none text-black outline-none transition-opacity hover:opacity-80 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-30 disabled:hover:opacity-30"
    >
      <Send size={11} />
      {text}
    </button>
  );
}

CommentAvatar.propTypes = { author: PropTypes.object, size: PropTypes.number, t: PropTypes.func };
PostButton.propTypes = { disabled: PropTypes.bool, label: PropTypes.string, onClick: PropTypes.func };
