const TOKEN_KEY_PREFIX = "designSystems.token.";

/** "surfaceMuted" / "text_muted" / "brand-ink" -> "Surface muted". */
export function humanizeKey(key) {
  const words = String(key)
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_\-\s]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Translated label for a token key; user-added keys fall back to a humanised form. */
export function tokenLabel(key, t) {
  const i18nKey = `${TOKEN_KEY_PREFIX}${key}`;
  const translated = t(i18nKey);
  // `t` returns the key itself when no entry exists.
  return translated === i18nKey ? humanizeKey(key) : translated;
}

/**
 * Readable name for the token at `path` (e.g. ["components", "button", "paddingX"]).
 * Scale entries are positional, so they read "Size 3" / "Step 3".
 */
export function tokenPathLabel(path, t) {
  const [group, ...rest] = path;
  if (/^\d+$/.test(rest[0] ?? "")) {
    const index = Number(rest[0]) + 1;
    return t(group === "typeScale" ? "designSystems.sizeStep" : "designSystems.step", { index });
  }
  return rest.map((key) => tokenLabel(key, t)).join(" ");
}
