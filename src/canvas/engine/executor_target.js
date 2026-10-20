import { PLATFORM_TARGET } from "../nodes/types.js";
import { getSetting } from "../../shared/settings.js";
import { platformIsTurnedOff } from "../generation_target_defaults.js";
import { RunError } from "./executor_errors.js";

/**
 * Which chat this node's run is sent to.
 *
 * The node's platform is the user's choice (PlatformSelect writes it), and that
 * choice is honoured even when the website's tab is not open right now: the
 * host opens a missing website itself (rpc_tab_transport → resolvePlatformTab,
 * allowCreate), so a closed tab costs a tab, not a retry, and never a reroute.
 *
 * The one fact that disqualifies the choice is the user turning the website OFF
 * (`ciw.disabledSitePlatforms` — "Hidden" in Settings). The automatic route
 * resolver and the agent's failure advice both read that as "not usable"
 * (`platformHasOpenTab`), and the picker already hides it, so driving it anyway
 * would make this file the only place in the app that says the route is fine.
 *
 * It is refused loudly instead of replaced, because both replacements lie:
 * substituting another website silently changes which model produced the
 * picture, and taking the resolver's automatic pick would silently spend the
 * user's credits — its answer for "no usable website" is the configured API
 * route. Failing here hands the node to the failure advice, which exists to ask
 * the user which route to use.
 *
 * AUTO, or a node saved before the picker stopped offering AUTO, passes
 * through: it means "the page this canvas sits on", which the host resolves.
 *
 * @param {{id: string, data: Object}} node
 * @param {{disabledSites?: *}} [context] - Test seam for the setting below.
 * @returns {string} A PLATFORM_TARGET value.
 * @throws {RunError} `platformDisabled` when the node is pinned to a hidden site.
 */
export function resolveTarget(node, context = {}) {
  const target = node.data.platform ?? PLATFORM_TARGET.AUTO;
  if (target === PLATFORM_TARGET.AUTO) return target;
  const disabledSites =
    context.disabledSites ?? getSetting("ciw.disabledSitePlatforms") ?? [];
  if (!platformIsTurnedOff(target, disabledSites)) return target;
  throw new RunError("platformDisabled", node.id, {
    details: { platform: target },
  });
}
