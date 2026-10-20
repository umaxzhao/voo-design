/**
 * Identity Lock — a run-scoped brand constraint.
 *
 * Resolves a single enforceable brand ("identity lock") for a run from, in
 * precedence order, a Batch node, its Group, the project brief's referenced
 * brand, or an agent run's constraints. The resolved lock is threaded into the
 * run context and appended to every generation prompt, so each member of a run
 * shares one palette/typography/logo boundary.
 *
 * Pure runtime logic — zero React dependencies.
 *
 * @module agent-runtime/identity-lock
 */

import { resolveEffectiveBrand, sanitizeBrand } from "./global-memory.js";

export const IDENTITY_LOCK_ENFORCE = Object.freeze({
  STRICT: "strict",
  SOFT: "soft",
});

const ENFORCE_VALUES = new Set(Object.values(IDENTITY_LOCK_ENFORCE));

function trimmedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** De-duplicates forbidden entries while preserving the first-seen order. */
function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/**
 * A stable fingerprint over the enforcing fields (colors, fonts, forbidden,
 * logo). Name, enforce mode, safe area and ids are metadata: they never enter
 * the fingerprint, so two locks that constrain generation identically share it.
 */
function fingerprintFor({ colors, fonts, forbidden, logoAssetId }) {
  return JSON.stringify([
    colors.map((color) => [color.hex, color.role]),
    fonts.map((font) => [font.family, font.role]),
    [...forbidden].sort(),
    logoAssetId ?? null,
  ]);
}

/** True when a lock carries nothing a generation prompt can enforce. */
function isIdentityLockEmpty(lock) {
  if (!lock || typeof lock !== "object") return true;
  return (
    (lock.colors?.length ?? 0) === 0 &&
    (lock.fonts?.length ?? 0) === 0 &&
    (lock.forbidden?.length ?? 0) === 0 &&
    !lock.logoAssetId &&
    !lock.safeArea
  );
}

/**
 * Normalizes a raw identity lock / brand into the canonical lock shape.
 *
 * Reuses `sanitizeBrand` for color, font, logo, safe-area and forbidden
 * normalization so the lock and the global brand library cannot drift. Returns
 * `null` for non-object input; an object with no enforcing fields is a valid but
 * empty lock (callers drop it via `isIdentityLockEmpty`).
 *
 * @param {any} raw
 * @returns {{
 *   brandRefId: string|null, brandId: string|null, name: string|null,
 *   colors: Array<{hex: string, role: string}>,
 *   fonts: Array<{family: string, role: string}>,
 *   logoAssetId: string|null,
 *   safeArea: {top: number, right: number, bottom: number, left: number}|null,
 *   forbidden: string[], enforce: "strict"|"soft", fingerprint: string
 * }|null}
 */
export function sanitizeIdentityLock(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const brand = sanitizeBrand(raw);
  const colors = brand.colors.map((color) => ({
    hex: color.hex,
    role: color.role,
  }));
  const fonts = brand.fonts.map((font) => ({
    family: font.family,
    role: font.role,
  }));
  const forbidden = uniqueStrings(brand.forbidden);
  const logoAssetId = brand.logoAssetId ?? null;
  const safeArea = brand.safeArea ? { ...brand.safeArea } : null;

  const enforceValue = trimmedString(raw.enforce);
  const enforce = ENFORCE_VALUES.has(enforceValue)
    ? enforceValue
    : IDENTITY_LOCK_ENFORCE.STRICT;

  const lock = {
    // A referenced brand is usually passed in as a resolved effective brand;
    // honor both the explicit reference id and its `referencedBrandId` alias.
    brandRefId:
      trimmedString(raw.brandRefId) ??
      trimmedString(raw.referencedBrandId) ??
      null,
    brandId: trimmedString(raw.brandId) ?? trimmedString(raw.id) ?? null,
    name: trimmedString(raw.name) ?? null,
    colors,
    fonts,
    logoAssetId,
    safeArea,
    forbidden,
    enforce,
  };
  lock.fingerprint = fingerprintFor(lock);
  return lock;
}

/**
 * Resolves the identity lock for a run.
 *
 * Precedence (first non-empty wins):
 *   1. `batchNode.data.identityLock`
 *   2. `groupNode.data.identityLock`
 *   3. `projectBrief.brandRefId`, merged over `globalBrands` by
 *      `resolveEffectiveBrand`
 *   4. `agentRun.constraints.identityLock`
 *
 * @param {Object} [options]
 * @param {{data?: {identityLock?: any}}|null} [options.batchNode]
 * @param {{data?: {identityLock?: any}}|null} [options.groupNode]
 * @param {Object|null} [options.projectBrief]
 * @param {Array} [options.globalBrands]
 * @param {{constraints?: {identityLock?: any}}|null} [options.agentRun]
 * @returns {ReturnType<typeof sanitizeIdentityLock>} the lock, or `null` when
 *   nothing enforceable was set (callers must then behave exactly as today).
 */
export function resolveRunIdentityLock({
  batchNode = null,
  groupNode = null,
  projectBrief = null,
  globalBrands = [],
  agentRun = null,
} = {}) {
  const candidates = [
    sanitizeIdentityLock(batchNode?.data?.identityLock),
    sanitizeIdentityLock(groupNode?.data?.identityLock),
  ];

  if (projectBrief?.brandRefId) {
    const library = Array.isArray(globalBrands) ? globalBrands : [];
    candidates.push(
      sanitizeIdentityLock(resolveEffectiveBrand(projectBrief, library)),
    );
  }

  candidates.push(sanitizeIdentityLock(agentRun?.constraints?.identityLock));

  for (const candidate of candidates) {
    if (candidate && !isIdentityLockEmpty(candidate)) return candidate;
  }
  return null;
}

/**
 * Formats a resolved lock into a deterministic English prompt block.
 *
 * Empty sections are omitted. Returns `""` for a null/empty lock, so callers
 * can always append the result without changing a prompt when no lock resolved.
 *
 * @param {ReturnType<typeof sanitizeIdentityLock>} lock
 * @returns {string}
 */
export function formatIdentityLockForPrompt(lock) {
  if (!lock || typeof lock !== "object" || isIdentityLockEmpty(lock)) return "";

  const lines = ["### Identity Lock (apply to every image in this run)"];

  const name = trimmedString(lock.name);
  if (name) lines.push(`- Brand: ${name}`);

  if (Array.isArray(lock.colors) && lock.colors.length > 0) {
    const palette = lock.colors
      .map((color) =>
        color?.role ? `${color.hex} (${color.role})` : String(color?.hex ?? ""),
      )
      .join(", ");
    lines.push(`- Palette: ${palette}`);
  }

  if (Array.isArray(lock.fonts) && lock.fonts.length > 0) {
    const typography = lock.fonts
      .map((font) =>
        font?.role
          ? `${font.family} (${font.role})`
          : String(font?.family ?? ""),
      )
      .join(", ");
    lines.push(`- Typography: ${typography}`);
  }

  if (Array.isArray(lock.forbidden) && lock.forbidden.length > 0) {
    lines.push(`- Forbidden: ${lock.forbidden.join(", ")}`);
  }

  const logoAssetId = trimmedString(lock.logoAssetId);
  if (logoAssetId) lines.push(`- Logo: ${logoAssetId}`);

  if (lock.safeArea && typeof lock.safeArea === "object") {
    const { top = 0, right = 0, bottom = 0, left = 0 } = lock.safeArea;
    lines.push(
      `- Safe area: top ${top}px, right ${right}px, bottom ${bottom}px, left ${left}px`,
    );
  }

  lines.push(
    "Do not introduce any colors or typefaces outside the identity lock above.",
  );
  return lines.join("\n");
}
