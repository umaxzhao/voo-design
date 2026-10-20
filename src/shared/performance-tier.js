/**
 * Machine-capability signals and the performance tier they resolve to.
 *
 * This module answers one question — "how capable is the machine this canvas is
 * running on?" — and nothing else. It deliberately does NOT decide where a
 * generation goes: wiring the tier into the default model routes is a separate
 * change, so that this stays a pure, injectable function the tests can drive
 * with any signal combination (contract: docs/plan-performance-tier.md §2).
 *
 * Two rules from that contract are load-bearing here:
 *
 *  - **Unknown is not low.** A tier of `"c"` needs positive evidence (an
 *    unsupported platform, a GPU that is known to be software-only, memory
 *    below the 16 GB class, or not enough disk). Anything we could not measure
 *    falls back to `"b"`, which is today's local-first behaviour — a failed
 *    probe must never quietly move a user onto a paid cloud provider.
 *  - **Nothing here imports DOM or electron.** The browser signals are read
 *    through `globalThis.navigator` inside a function, and the desktop payload
 *    is passed in as plain data, so the same module runs in a node test, a
 *    content script and the Electron renderer.
 */

/** The four tier values. `UNKNOWN` is a tier, not a synonym for `LOW`. */
export const PERFORMANCE_TIER = Object.freeze({
  HIGH: "a",
  MID: "b",
  LOW: "c",
  UNKNOWN: "unknown",
});

export const GIBIBYTE = 1024 ** 3;

/** The value every "could not measure this" field carries. */
export const UNKNOWN_SIGNAL = "unknown";

/**
 * The exact thresholds. They are GiB, not decimal GB, and they are the
 * *reachable* floors of the two memory classes: a machine sold as 24 GB reports
 * ~23.4 GiB and one sold as 16 GB reports ~15.5 GiB once firmware and an
 * integrated GPU have taken their share. Comparing against a literal 24/16 here
 * would push a 16 GB machine into the low tier — and its user onto paid cloud.
 *
 * The disk floor has **two** values, because the question differs by whether the
 * weights are already on that volume:
 *
 *  - nothing installed → the whole download plus headroom must fit: 11.1 GB of
 *    weights + the manager's 2 GB reserve → `diskBytesMin` = 15 GiB;
 *  - the target model already installed → only room to *run* is needed:
 *    `diskBytesMinInstalled` = 2 GiB, at least the same 2 GB reserve
 *    (`electron/local_engine_manager.js:38`).
 *
 * Without the second value, a machine that installed the model — 20 GB free
 * before, 6.9 GB after — would be judged low on its next start and sent to the
 * cloud *because the user installed the local model*, the opposite of the
 * intent. The 22 GB figure in older copy is out of date.
 */
export const PERFORMANCE_TIER_THRESHOLDS = Object.freeze({
  ramGiBHigh: 23.0,
  ramGiBMid: 15.0,
  diskBytesMin: 15 * GIBIBYTE,
  diskBytesMinInstalled: 2 * GIBIBYTE,
});

/** A positive, finite number, or null when the signal is unusable. */
function knownNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function unknownIfMissingNumber(value) {
  return knownNumber(value) ?? UNKNOWN_SIGNAL;
}

/** Only a real boolean counts as evidence about the platform. */
function knownBoolean(value) {
  return typeof value === "boolean" ? value : UNKNOWN_SIGNAL;
}

/** `true` / `false` / `"unknown"`, with anything else treated as unknown. */
function knownGpu(value) {
  return typeof value === "boolean" ? value : UNKNOWN_SIGNAL;
}

/** Bytes → GiB, or `"unknown"` when the byte count is not usable. */
export function bytesToGiB(bytes) {
  const value = knownNumber(bytes);
  return value === null ? UNKNOWN_SIGNAL : value / GIBIBYTE;
}

/**
 * Resolves the capability signals to a tier.
 *
 * Order matters and is fixed by the contract (§2.2): every low-tier trigger is
 * checked first, then high needs four positive facts, then the remaining middle
 * band is split from "not enough evidence". The function is pure — same input,
 * same output, no clock, no randomness — and never mutates its argument.
 *
 * @param {{
 *   platform?: string, arch?: string,
 *   platformSupported?: boolean|"unknown",
 *   gpu?: boolean|"unknown",
 *   ramGiB?: number|"unknown",
 *   diskFreeBytes?: number|"unknown",
 *   cpuCores?: number|"unknown",
 *   modelInstalled?: boolean|"unknown",
 * }} [inputs] `modelInstalled` picks which disk floor applies (`true` → the
 *   running floor, anything else → the install floor, so "we could not tell"
 *   stays on today's conservative rule).
 * @returns {{
 *   tier: "a"|"b"|"c"|"unknown", reason: string, reasons: string[],
 *   unknownSignals: string[], signals: object,
 * }}
 */
export function resolvePerformanceTier(inputs = {}) {
  const source = inputs && typeof inputs === "object" ? inputs : {};
  const platform = typeof source.platform === "string" ? source.platform : UNKNOWN_SIGNAL;
  const arch = typeof source.arch === "string" ? source.arch : UNKNOWN_SIGNAL;
  const platformSupported = knownBoolean(source.platformSupported);
  const gpu = knownGpu(source.gpu);
  const ramGiB = knownNumber(source.ramGiB);
  const diskFreeBytes = knownNumber(source.diskFreeBytes);
  const cpuCores = unknownIfMissingNumber(source.cpuCores);
  const modelInstalled = knownBoolean(source.modelInstalled);
  // Only positive knowledge that the weights are here lowers the bar: anything
  // else (false *and* "unknown") must keep the full-download floor, or a failed
  // disk/installed probe would let a machine try an install it cannot finish.
  const diskFloorBytes =
    modelInstalled === true
      ? PERFORMANCE_TIER_THRESHOLDS.diskBytesMinInstalled
      : PERFORMANCE_TIER_THRESHOLDS.diskBytesMin;

  const unknownSignals = [];
  if (platformSupported === UNKNOWN_SIGNAL) unknownSignals.push("platformSupported");
  if (gpu === UNKNOWN_SIGNAL) unknownSignals.push("gpu");
  if (ramGiB === null) unknownSignals.push("ramGiB");
  if (diskFreeBytes === null) unknownSignals.push("diskFreeBytes");

  const signals = Object.freeze({
    platform,
    arch,
    platformSupported,
    gpu,
    ramGiB: ramGiB ?? UNKNOWN_SIGNAL,
    diskFreeBytes: diskFreeBytes ?? UNKNOWN_SIGNAL,
    cpuCores,
    // Not part of `unknownSignals`: an unreadable install state is not evidence
    // against the machine, it just keeps the conservative floor.
    modelInstalled,
    diskFloorBytes,
  });

  const decide = (tier, reason) => ({
    tier,
    reason,
    // Ordered machine tokens, never prose: the settings surface owns the
    // wording (and the i18n keys), so a pure module stays translatable.
    reasons: [reason, ...unknownSignals.map((signal) => `${signal}-unknown`)],
    unknownSignals,
    signals,
  });

  // 1-4: low needs one positive bad fact.
  if (platformSupported === false) return decide(PERFORMANCE_TIER.LOW, "platform-unsupported");
  if (gpu === false) return decide(PERFORMANCE_TIER.LOW, "no-gpu");
  if (ramGiB !== null && ramGiB < PERFORMANCE_TIER_THRESHOLDS.ramGiBMid) {
    return decide(PERFORMANCE_TIER.LOW, "ram-below-16");
  }
  if (diskFreeBytes !== null && diskFreeBytes < diskFloorBytes) {
    return decide(
      PERFORMANCE_TIER.LOW,
      modelInstalled === true ? "disk-below-headroom" : "disk-below-15",
    );
  }

  // 5: high needs all four facts, positively.
  if (
    platformSupported === true &&
    gpu === true &&
    ramGiB !== null &&
    ramGiB >= PERFORMANCE_TIER_THRESHOLDS.ramGiBHigh &&
    diskFreeBytes !== null &&
    diskFreeBytes >= diskFloorBytes
  ) {
    return decide(PERFORMANCE_TIER.HIGH, "high");
  }

  // 6: the 16-24 GB band, with a GPU that is present or merely unproven.
  if (
    platformSupported === true &&
    ramGiB !== null &&
    ramGiB >= PERFORMANCE_TIER_THRESHOLDS.ramGiBMid &&
    ramGiB < PERFORMANCE_TIER_THRESHOLDS.ramGiBHigh &&
    (gpu === true || gpu === UNKNOWN_SIGNAL) &&
    (diskFreeBytes === null || diskFreeBytes >= diskFloorBytes)
  ) {
    return decide(PERFORMANCE_TIER.MID, "mid");
  }

  // 7: everything else, including any unknown signal. Never "c".
  return decide(PERFORMANCE_TIER.MID, "unknown-signals");
}

/**
 * The browser/extension half of the probe.
 *
 * `navigator.deviceMemory` is a coarse, capped number (powers of two up to 8),
 * so a web page always lands below the 16 GB class here — which matches the
 * other, stronger fact: a page can never install the managed engine, so
 * `platformSupported` is false for every non-desktop surface. Disk space is not
 * readable from a page at all, hence `"unknown"`.
 *
 * Missing APIs are not errors: they produce `"unknown"` (and `false` only for
 * the platform fact we can state positively).
 *
 * @param {object} [navigatorLike] defaults to `globalThis.navigator`
 */
export function collectBrowserSignals(navigatorLike = globalThis.navigator) {
  if (!navigatorLike || typeof navigatorLike !== "object") {
    return {
      platform: UNKNOWN_SIGNAL,
      arch: UNKNOWN_SIGNAL,
      platformSupported: false,
      gpu: UNKNOWN_SIGNAL,
      ramGiB: UNKNOWN_SIGNAL,
      diskFreeBytes: UNKNOWN_SIGNAL,
      cpuCores: UNKNOWN_SIGNAL,
    };
  }
  const hasWebGpu =
    typeof navigatorLike.gpu === "object" && navigatorLike.gpu !== null;
  return {
    platform: navigatorLike.userAgentData?.platform ?? UNKNOWN_SIGNAL,
    arch: UNKNOWN_SIGNAL,
    // A web page cannot install or launch the managed engine, whatever the
    // hardware is: that is a fact about the surface, not about the machine.
    platformSupported: false,
    // A missing WebGPU is not evidence of a software-only machine, so it stays
    // unknown rather than false — the platform fact above already decides.
    gpu: hasWebGpu ? true : UNKNOWN_SIGNAL,
    ramGiB: unknownIfMissingNumber(navigatorLike.deviceMemory),
    diskFreeBytes: UNKNOWN_SIGNAL,
    cpuCores: unknownIfMissingNumber(navigatorLike.hardwareConcurrency),
  };
}

/**
 * Normalises the desktop payload (`vooDesktop.system.info()`) into the same
 * signal shape the browser collector returns.
 *
 * A failed or absent payload stays `"unknown"` in every field — importantly
 * `platformSupported` too. Claiming `false` here would turn "the probe did not
 * answer" into the low tier, which is exactly the mistake the contract forbids.
 *
 * @param {object|null} info the raw `{ ok, value }`-unwrapped desktop payload
 */
export function signalsFromSystemInfo(info) {
  if (!info || typeof info !== "object") {
    return {
      platform: UNKNOWN_SIGNAL,
      arch: UNKNOWN_SIGNAL,
      platformSupported: UNKNOWN_SIGNAL,
      gpu: UNKNOWN_SIGNAL,
      ramGiB: UNKNOWN_SIGNAL,
      diskFreeBytes: UNKNOWN_SIGNAL,
      cpuCores: UNKNOWN_SIGNAL,
    };
  }
  return {
    platform: typeof info.platform === "string" ? info.platform : UNKNOWN_SIGNAL,
    arch: typeof info.arch === "string" ? info.arch : UNKNOWN_SIGNAL,
    platformSupported: knownBoolean(info.platformSupported),
    gpu: knownGpu(info.gpu),
    ramGiB: bytesToGiB(info.totalMemoryBytes),
    diskFreeBytes: unknownIfMissingNumber(info.diskFreeBytes),
    cpuCores: unknownIfMissingNumber(info.cpuCores),
  };
}
