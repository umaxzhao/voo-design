/** Escaped HTML attributes, media sources, and simple CSS motion for export. */
const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value).replace(ESCAPE_RE, (character) => ESCAPE_MAP[character]);
}

export function cssNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
}

export function safeCssValue(value, fallback = "transparent") {
  if (typeof value !== "string") return fallback;
  if (/[;{}<>]/.test(value) || /url\s*\(|expression\s*\(|@import/i.test(value))
    return fallback;
  return /^[\w#.,()%\s+-]+$/.test(value) ? value : fallback;
}

export function safeFontFamily(value) {
  const family = String(value ?? "sans-serif");
  return /^[\w\s,'"-]+$/.test(family) ? family : "sans-serif";
}

export function safeImageSource(value) {
  if (typeof value !== "string") return null;
  if (
    /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[a-z\d+/=]+$/i.test(
      value,
    )
  )
    return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function safeVideoSource(value) {
  if (typeof value !== "string") return null;
  if (/^data:video\/(?:mp4|webm|ogg);base64,[a-z\d+/=]+$/i.test(value))
    return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return /^(?:\.\.?\/)?[\w./%-]+(?:\?[\w=&%-]+)?$/.test(value) &&
      !value.startsWith("//") &&
      !value.includes("..")
      ? value
      : null;
  }
}

export function videoMarkup(
  source,
  className,
  layerName,
  media = {},
  poster = null,
) {
  const safeSource = safeVideoSource(source);
  if (!safeSource) throw new Error("html-export-video-source");
  const safePoster = safeImageSource(poster);
  const inPoint = Math.max(0, cssNumber(media.inPoint));
  const outPoint = Number.isFinite(media.outPoint)
    ? Math.max(inPoint, cssNumber(media.outPoint))
    : null;
  const speed =
    Number.isFinite(media.speed) && media.speed > 0
      ? Math.max(0.01, cssNumber(media.speed))
      : 1;
  return `<video class="${className}"${layerName} src="${escapeHtml(safeSource)}"${safePoster ? ` poster="${escapeHtml(safePoster)}"` : ""} controls playsinline preload="metadata"${media.muted ? " muted" : ""} data-voo-in="${inPoint}"${outPoint === null ? "" : ` data-voo-out="${outPoint}"`} data-voo-speed="${speed}"></video>`;
}

/**
 * Sound for the HTML export: the same clip data a `<video>` carries, plus the
 * level it plays at and the fades it fades by, so the page's own runtime can
 * shape it exactly as the editor does.
 */
export function audioMarkup(
  source,
  className,
  layerName,
  media = {},
  timing = null,
) {
  const safeSource = safeVideoSource(source);
  if (!safeSource) throw new Error("html-export-audio-source");
  const inPoint = Math.max(0, cssNumber(media.inPoint));
  const outPoint = Number.isFinite(media.outPoint)
    ? Math.max(inPoint, cssNumber(media.outPoint))
    : null;
  const speed =
    Number.isFinite(media.speed) && media.speed > 0
      ? Math.max(0.01, cssNumber(media.speed))
      : 1;
  const volume = Math.max(0, Math.min(1, cssNumber(media.volume ?? 1)));
  const fadeIn = Math.max(0, cssNumber(media.fadeIn));
  const fadeOut = Math.max(0, cssNumber(media.fadeOut));
  const start = Math.max(0, cssNumber(timing?.start ?? 0));
  // Sound paints nothing, so it gets no box and no player of its own: it is
  // hidden in the page and driven by the runtime's one sound toggle, which is
  // what keeps a native control off every exported artwork. The author's
  // mute rides in the data channel (`data-voo-muted`) rather than only the
  // browser attribute — the toggle clears the attribute when it starts the
  // tracks, and the author's choice must survive that.
  return `<audio class="${className}"${layerName} src="${escapeHtml(safeSource)}" hidden preload="metadata"${media.muted ? " muted data-voo-muted=\"true\"" : ""} data-voo-in="${inPoint}"${outPoint === null ? "" : ` data-voo-out="${outPoint}"`} data-voo-start="${start}" data-voo-speed="${speed}" data-voo-volume="${volume}" data-voo-fade-in="${fadeIn}" data-voo-fade-out="${fadeOut}"></audio>`;
}

export function animationCss(
  node,
  className,
  parent,
  bounds,
  duration,
  start,
  css,
  loop = false,
) {
  const properties = {
    x: (value) => `left:${cssNumber(value - (parent?.x ?? bounds.x))}px`,
    y: (value) => `top:${cssNumber(value - (parent?.y ?? bounds.y))}px`,
    width: (value) => `width:${Math.max(0, cssNumber(value))}px`,
    height: (value) => `height:${Math.max(0, cssNumber(value))}px`,
    opacity: (value) => `opacity:${Math.max(0, Math.min(1, cssNumber(value)))}`,
    rotation: (value) => `transform:rotate(${cssNumber(value)}deg)`,
  };
  const names = [];
  for (const [index, track] of (node.animations ?? []).entries()) {
    const valueCss = properties[track.property];
    if (!valueCss || !Array.isArray(track.keyframes)) continue;
    const frames = track.keyframes.filter(
      (frame) =>
        Number.isFinite(frame.time) &&
        Number.isFinite(frame.value) &&
        frame.time >= 0,
    );
    if (frames.length === 0) continue;
    const name = `${className}-motion-${index}`;
    const rules = frames.map((frame) => {
      const percent = Math.max(
        0,
        Math.min(100, cssNumber((frame.time / duration) * 100)),
      );
      return `${percent}%{${valueCss(frame.value)}}`;
    });
    css.push(`@keyframes ${name}{${rules.join("")}}`);
    names.push(name);
  }
  if (names.length) {
    css.push(
      `.${className}{animation-name:${names.join(",")};animation-duration:${names.map(() => `${duration}s`).join(",")};animation-delay:${names.map(() => `${-start}s`).join(",")};animation-fill-mode:both;animation-timing-function:linear;animation-iteration-count:${loop ? "infinite" : 1}}`,
    );
  }
}
