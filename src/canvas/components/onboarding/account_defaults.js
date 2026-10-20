/**
 * What choosing the VOO account path actually writes.
 *
 * The account path is the whole setup for someone who does not want to bring
 * their own providers: the agent runs on VOO credits, so every route a new
 * generation can take is pinned to the **cloud** default and written explicitly.
 * Writing them is the point of this module — the choice becomes visible in
 * Settings, and it does not drift the next time a built-in default moves.
 *
 * The cloud map is deliberately its own table, not `DEFAULT_MODEL_ROUTES`.
 * Since the image routes moved onto the local engine
 * (`docs/plan-qwen21-primary.md`), the built-in default for them is `local` —
 * "everything on VOO's cloud" cannot mean "and the pictures run on your GPU".
 * Deriving from the built-in table made this path pin local by accident; a
 * table of its own can only move when a human moves it.
 *
 * Two things this path deliberately does NOT own:
 *
 *  - Browser-platform sessions (`ciw.disabledSitePlatforms`, see
 *    site_model_settings.jsx). "Everything on VOO's cloud" excludes the sites
 *    VOO drives in the user's own tabs, on the accounts they already have.
 *  - The local-only routes (matting, object selection). Their provider is the
 *    local built-in and a cloud account has nothing to say about them.
 *
 * Both are left exactly as they were, so choosing this path can only add the
 * cloud defaults and can never clear a setting it has no opinion on.
 */
import {
  DEFAULT_API_AUDIO_MODEL_ID,
  DEFAULT_API_IMAGE_MODEL_ID,
  DEFAULT_API_VIDEO_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  PROVIDER_ID,
} from "../../../shared/providers.js";
import {
  AUTOMATIC_MODEL_ROUTE,
  MODEL_ROUTES_KEY,
  MODEL_ROUTE_ID,
  getStoredModelRoutesAsync,
} from "../../../shared/model-routes.js";
import { setSetting } from "../../../shared/settings.js";

/**
 * The route ids the account path pins to the cloud: every route a new
 * generation can take. Repaint, outpaint and selection-repaint are absent on
 * purpose — they inherit `editor-image`, which is pinned here, so they follow
 * it without a second copy of the same decision.
 */
export const ACCOUNT_CLOUD_ROUTE_IDS = Object.freeze([
  MODEL_ROUTE_ID.IMAGE_GENERATION,
  MODEL_ROUTE_ID.VIDEO_GENERATION,
  MODEL_ROUTE_ID.AUDIO_GENERATION,
  MODEL_ROUTE_ID.EDITOR_IMAGE,
]);

/**
 * Routes explicitly exempted from the VOO account cloud path, with their rationale.
 *
 * 3D generation is not provided by VOO cloud credit gateway, so the route
 * remains unpinned (Auto) on this path instead of pretending cloud can run it.
 */
export const ACCOUNT_CLOUD_ROUTE_EXEMPTIONS = Object.freeze({
  [MODEL_ROUTE_ID.MODEL_3D_GENERATION]:
    "VOO Cloud credits do not provide a 3D generation model; route remains Auto / unpinned.",
});

/**
 * The provider/model pair each cloud route is pinned to.
 *
 * `DEFAULT_PROVIDER_ID` is the app's cloud gateway (302.AI) — the only
 * provider that serves audio at all — and each route takes that
 * medium's cloud model, which for both image routes is the image catalogue
 * default. Frozen, so a caller cannot mutate the map it is about to write.
 */
export const ACCOUNT_CLOUD_ROUTES = Object.freeze({
  [MODEL_ROUTE_ID.IMAGE_GENERATION]: Object.freeze({
    providerId: DEFAULT_PROVIDER_ID,
    modelId: DEFAULT_API_IMAGE_MODEL_ID,
  }),
  [MODEL_ROUTE_ID.VIDEO_GENERATION]: Object.freeze({
    providerId: DEFAULT_PROVIDER_ID,
    modelId: DEFAULT_API_VIDEO_MODEL_ID,
  }),
  [MODEL_ROUTE_ID.AUDIO_GENERATION]: Object.freeze({
    providerId: DEFAULT_PROVIDER_ID,
    modelId: DEFAULT_API_AUDIO_MODEL_ID,
  }),
  [MODEL_ROUTE_ID.EDITOR_IMAGE]: Object.freeze({
    providerId: DEFAULT_PROVIDER_ID,
    modelId: DEFAULT_API_IMAGE_MODEL_ID,
  }),
});

/**
 * Pure: the stored route map the account path should leave behind.
 *
 * Every cloud route takes the cloud entry above; any other stored route is
 * carried over untouched, so a route this path does not own can never be
 * silently dropped by it.
 *
 * @param {object|null} stored the current `voo.modelRoutes` value
 * @returns {object} the map to persist
 */
export function accountCloudRoutes(stored = {}) {
  const next = { ...(stored && typeof stored === "object" ? stored : {}) };
  for (const routeId of ACCOUNT_CLOUD_ROUTE_IDS) {
    const existing = stored?.[routeId];
    if (
      existing?.providerId &&
      existing.providerId !== AUTOMATIC_MODEL_ROUTE &&
      existing.providerId !== PROVIDER_ID.LOCAL &&
      existing?.modelId
    ) {
      continue;
    }
    const route = ACCOUNT_CLOUD_ROUTES[routeId];
    next[routeId] = { providerId: route.providerId, modelId: route.modelId };
  }
  return next;
}

/**
 * Persists `accountCloudRoutes` over whatever is stored now.
 *
 * @returns {Promise<object>} the map that was written
 */
export async function applyAccountCloudRoutes() {
  const stored = await getStoredModelRoutesAsync();
  const next = accountCloudRoutes(stored);
  await setSetting(MODEL_ROUTES_KEY, next);
  return next;
}
