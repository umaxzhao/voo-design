/**
 * Expands component instances into their own layers.
 *
 * A Figma instance stores no children. Its content is the master component's
 * layer tree, with the instance's overrides applied (text, fills, size,
 * visibility, opacity, font) and the geometry Figma recalculated for it in
 * `derivedSymbolData`. This pass copies that tree under each instance as plain
 * change records, so the mapper treats an instance like any other container.
 *
 * Instances stay as containers, so their origin matches Figma's coordinate rules.
 * Overrides and derived geometry are keyed by the master's layer ids; nested
 * instances expand the same way until no instance is left.
 */

/** Session id for expanded copies, so their ids never collide with the file's own. */
const EXPANDED_SESSION_ID = 0x7fffffff;
/** Nesting guard: a component that instantiates itself stops here instead of looping. */
const MAX_INSTANCE_DEPTH = 16;
/** Override fields that describe the file, not the layer, so they are not applied. */
const NON_VISUAL_FIELDS = new Set(["guidPath", "exportSettings", "pluginData", "pluginRelaunchData"]);

const keyOf = (guid) => (guid ? `${guid.sessionID}:${guid.localID}` : null);

function indexBy(entries, keyFor) {
  const map = new Map();
  for (const entry of entries) {
    const key = keyFor(entry);
    if (key) map.set(key, [...(map.get(key) ?? []), entry]);
  }
  return map;
}

/** The layer an override or derived entry refers to: the last guid of its path. */
function targetKeyOf(entry) {
  const guids = entry?.guidPath?.guids ?? [];
  return guids.length > 0 ? keyOf(guids[guids.length - 1]) : null;
}

function applyOverride(copy, override) {
  for (const [field, value] of Object.entries(override)) {
    if (NON_VISUAL_FIELDS.has(field)) continue;
    if (field === "textData" && copy.textData) {
      copy.textData = { ...copy.textData, ...value };
    } else {
      copy[field] = value;
    }
  }
}

/** Returns a new change list with every instance's content copied under it. */
export function expandInstances(changes) {
  const byKey = new Map(changes.map((change) => [keyOf(change.guid), change]));
  const childrenOf = indexBy(changes, (change) => (change.parentIndex ? keyOf(change.parentIndex.guid) : null));
  const out = [...changes];
  const outIndexByKey = new Map();
  for (let i = 0; i < changes.length; i++) {
    const k = keyOf(changes[i]?.guid);
    if (k) outIndexByKey.set(k, i);
  }
  let nextLocalId = 1;
  const queue = changes
    .filter((change) => change.type === "INSTANCE" && change.symbolData?.symbolID)
    .map((instance) => ({ instance, depth: 0 }));

  const copyTree = (source, parentGuid, overridesFor, derivedFor, depth, queueNext) => {
    const sourceKey = keyOf(source.guid);
    const copy = {
      ...source,
      guid: { sessionID: EXPANDED_SESSION_ID, localID: nextLocalId++ },
      parentIndex: { guid: parentGuid, position: source.parentIndex?.position ?? "" },
    };
    for (const override of overridesFor.get(sourceKey) ?? []) applyOverride(copy, override);
    const derived = derivedFor.get(sourceKey);
    if (derived?.fillGeometry) copy.fillGeometry = derived.fillGeometry;
    if (derived?.strokeGeometry) copy.strokeGeometry = derived.strokeGeometry;
    const copyIndex = out.length;
    out.push(copy);
    const copyKey = keyOf(copy.guid);
    if (copyKey) outIndexByKey.set(copyKey, copyIndex);

    if (copy.type === "INSTANCE" && copy.symbolData?.symbolID) queueNext.push({ instance: copy, depth });
    for (const child of childrenOf.get(sourceKey) ?? []) {
      copyTree(child, copy.guid, overridesFor, derivedFor, depth, queueNext);
    }
    return copy;
  };

  while (queue.length > 0) {
    const { instance, depth } = queue.shift();
    const master = byKey.get(keyOf(instance.symbolData.symbolID));
    if (!master || depth >= MAX_INSTANCE_DEPTH) continue;

    const overridesFor = indexBy(instance.symbolData.symbolOverrides ?? [], targetKeyOf);
    const derivedFor = indexBy(instance.derivedSymbolData ?? [], targetKeyOf);

    // The instance record itself can carry overrides and derived geometry. Apply
    // them to a copy, so the input change list is left as it was.
    const host = { ...instance };
    for (const override of overridesFor.get(keyOf(master.guid)) ?? []) applyOverride(host, override);
    const derivedRoot = derivedFor.get(keyOf(master.guid))?.[0];
    if (derivedRoot?.fillGeometry) host.fillGeometry = derivedRoot.fillGeometry;

    // O(1) indexed lookup instead of O(N) linear search
    const instKey = keyOf(instance.guid);
    const targetIdx = instKey ? outIndexByKey.get(instKey) : undefined;
    if (targetIdx !== undefined) {
      out[targetIdx] = host;
      if (instKey) outIndexByKey.set(instKey, targetIdx);
    } else {
      const fallbackIdx = out.indexOf(instance);
      if (fallbackIdx >= 0) out[fallbackIdx] = host;
    }

    const queueNext = [];
    for (const child of childrenOf.get(keyOf(master.guid)) ?? []) {
      copyTree(child, host.guid, overridesFor, derivedFor, depth + 1, queueNext);
    }
    queue.push(...queueNext);
  }
  return out;
}
