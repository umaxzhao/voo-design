/**
 * Standalone model route resolver stub for voo_design.
 */

export function resolveModelRoute(intent) {
  return null;
}

export function resolveProviderForRoute(route) {
  return null;
}

export async function resolveCanvasModelRoute(routeId, fallback = null) {
  return fallback;
}

export async function resolveCanvasModelRouteCandidates(routeId, storedRoutes) {
  return [];
}

export async function resolveCanvasModelRouteFallbackChain(routeId, options = {}) {
  return [];
}

export function performanceTierGovernsRoute(routeId) {
  return false;
}
