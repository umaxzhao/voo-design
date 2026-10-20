/**
 * Which route a provider's traffic actually takes, for the surfaces that must
 * name the route rather than the upstream.
 *
 * `getProviderConfig` is where a credits-capable provider resolves its own
 * route (`own-key` / `credits` / `sign-in-required`), and it is a message to the
 * background — asynchronous, while a provider list, a node pill and a model
 * picker all have to draw now. One cache keeps every surface reading the same
 * fact instead of each deciding for itself what "on VOO" means; a key saved or
 * cleared anywhere republishes it, so the answer cannot go stale behind a
 * closed panel.
 */
import { useCallback, useEffect, useState } from "react";
import { getProviderConfig } from "./provider_client.js";
import { PROVIDER_AUTH_MODE } from "../shared/providers/provider_credentials.js";
import { canReadProviderState } from "./desktop_startup_scope.js";

const authModes = new Map();
const inflight = new Map();
const listeners = new Set();

function publish() {
  for (const listener of [...listeners]) listener();
}

/** The provider's resolved route, or null while it is still unknown. */
export function providerAuthMode(providerId) {
  return authModes.get(providerId) ?? null;
}

/**
 * Whether this provider runs on VOO credits right now — the one question every
 * branded surface asks.
 *
 * Unknown answers false: a surface that has not heard back yet keeps the
 * provider's own name rather than claiming a route it cannot vouch for. The
 * wrong direction would be branding an own-key user's provider as VOO.
 */
export function providerRunsOnCredits(providerId) {
  return providerAuthMode(providerId) === PROVIDER_AUTH_MODE.CREDITS;
}

/** Resolves one provider's route into the cache; concurrent callers share it. */
export function loadProviderAuthMode(providerId) {
  if (!providerId) return Promise.resolve(null);
  if (inflight.has(providerId)) return inflight.get(providerId);
  const request = Promise.resolve()
    .then(() => getProviderConfig({ providerId }))
    .then((config) => {
      authModes.set(providerId, config?.authMode ?? null);
      return authModes.get(providerId);
    })
    .catch(() => {
      // An unreachable provider is not a credits route; the fallback name is
      // the provider's own, which is also what a user with a key sees.
      authModes.set(providerId, null);
      return null;
    })
    .finally(() => {
      inflight.delete(providerId);
      publish();
    });
  inflight.set(providerId, request);
  return request;
}

/**
 * Auth modes for a set of providers, re-rendering when any of them resolves or
 * changes. Keyed by the id list, so a caller may pass a fresh array each render.
 */
export function useProviderAuthModes(providerIds) {
  const key = [...new Set((providerIds ?? []).filter(Boolean))].sort().join("|");
  const read = useCallback(
    () =>
      Object.fromEntries(
        (key ? key.split("|") : []).map((id) => [id, providerAuthMode(id)]),
      ),
    [key],
  );
  const [modes, setModes] = useState(read);

  useEffect(() => {
    if (!canReadProviderState()) return undefined;
    const ids = key ? key.split("|") : [];
    if (ids.length === 0) return undefined;
    let active = true;
    const sync = () => {
      if (active) setModes(read());
    };
    listeners.add(sync);
    Promise.all(ids.map((id) => loadProviderAuthMode(id))).then(sync);
    return () => {
      active = false;
      listeners.delete(sync);
    };
  }, [key, read]);

  return modes;
}

// A key saved or cleared anywhere changes the answer everywhere, so the cache
// refreshes in place rather than waiting for the next mount to notice.
if (typeof window !== "undefined") {
  window.addEventListener("ciw-provider-config-changed", () => {
    for (const id of [...authModes.keys()]) void loadProviderAuthMode(id);
  });
}
