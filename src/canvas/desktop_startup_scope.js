/** Root-mount smoke excludes platform adapters, not the genuine editor. */
function startupScope(desktop) {
  const scope = desktop?.executionScope;
  if (scope === undefined) return null;
  if (
    scope?.version !== 1 ||
    scope.kind !== "root-mount" ||
    scope.platformRouting !== false ||
    scope.managedEngines !== false ||
    scope.localCli !== false ||
    scope.remoteCatalog !== false
  ) {
    throw new Error("invalidDesktopExecutionScope");
  }
  return scope;
}

export function canProbeDesktopPlatform(desktop = globalThis.vooDesktop) {
  return startupScope(desktop) === null;
}

/** Only the automatic catalog refresh is excluded; explicit calls remain guarded. */
export function canRefreshCloudCatalog(desktop = globalThis.vooDesktop) {
  return startupScope(desktop) === null;
}

/** Automatic provider reads are deferred during root-mount smoke. */
export function canReadProviderState(desktop = globalThis.vooDesktop) {
  return startupScope(desktop) === null;
}
