import { synchronizeImagePublications } from "./image-publication.js";
import { workflowRetentionExclusion } from "./workflow_asset_retention.js";
import { referencedImageIds } from "../engine/graph.js";
import { getSetting, setSetting } from "../../shared/settings.js";
import * as db from "./db.js";
import {
  deleteWorkflow,
  listAssetIds,
  listWorkflows,
  pruneImages,
  saveWorkflow,
} from "./db.js";

/**
 * Multi-document bookkeeping: which workflows exist, which one is open, and
 * which stored images are still worth keeping.
 *
 * The "currently open document" pointer lives in the shared settings store
 * (shared/settings.js): authoritative in chrome.storage.local, mirrored to
 * localStorage so reads here stay synchronous — and reachable by the hosted
 * editor through the service worker's settings bridge.
 */

const CURRENT_ID_KEY = "ciw.currentWorkflowId";

/**
 * Folder bindings for the desktop client: workflow id -> { dir, project }.
 *
 *   dir      the folder this workflow actually writes into (absolute path)
 *   project  the containing project folder (absolute), or null when the
 *            workflow is a temporary session / not folder-backed at all
 *
 * A workflow bound at a project's root (the pre-multi-session layout) has
 * dir === project; sessions created later live in <project>/<name>/ and carry
 * both. Kept out of the shared settings store (which follows the extension's
 * chrome.storage) and out of workflow.json (which should stay portable): a
 * plain localStorage map that only the desktop canvas partition reads. Losing
 * it degrades a session to IndexedDB-only, never to a crash.
 */
const PROJECT_ROOTS_KEY = "voo.projectRoots";

function readProjectRoots() {
  try {
    return (
      JSON.parse(globalThis.localStorage?.getItem(PROJECT_ROOTS_KEY) ?? "{}") ??
      {}
    );
  } catch {
    return {};
  }
}

/** Normalises a stored value, legacy plain path strings included. */
function normalizeBinding(value) {
  if (!value) return null;
  const dir =
    typeof value === "string"
      ? value
      : typeof value?.dir === "string"
        ? value.dir
        : null;
  if (!dir) return null;
  // Anything under Temp/ is a temporary session by definition: it has a folder
  // to write into but belongs to no project group.
  const isTemp = dir.includes(`${pathSep()}Temp${pathSep()}`);
  let project;
  if (typeof value === "string") {
    // Legacy single-workflow layout: the folder is both dir and project.
    project = isTemp ? null : dir;
  } else if (typeof value.project === "string") {
    project = isTemp ? null : value.project;
  } else {
    project = isTemp ? null : dir;
  }
  return { dir, project };
}

/** The separator used in stored absolute paths. */
function pathSep() {
  return globalThis.navigator?.platform?.includes("Win") ? "\\" : "/";
}

/** Records (or clears) which folders a workflow is bound to. */
export function setProjectRootBinding(workflowId, binding) {
  try {
    const map = readProjectRoots();
    if (binding) map[workflowId] = binding;
    else delete map[workflowId];
    globalThis.localStorage?.setItem(PROJECT_ROOTS_KEY, JSON.stringify(map));
  } catch {
    // A lost binding only means the session is not folder-backed anymore.
  }
}

/**
 * Replaces oldPrefix with newPrefix if targetPath is oldPrefix or a subpath of it.
 * Preserves subpath structure and handles POSIX & Windows separators.
 */
export function replacePathPrefix(targetPath, oldPrefix, newPrefix) {
  if (typeof targetPath !== "string" || !targetPath) return targetPath;
  if (typeof oldPrefix !== "string" || !oldPrefix) return targetPath;
  if (typeof newPrefix !== "string" || !newPrefix) return targetPath;

  const cleanOld = oldPrefix.replace(/[\\/]+$/, "");
  const cleanNew = newPrefix.replace(/[\\/]+$/, "");
  const cleanTarget = targetPath.replace(/[\\/]+$/, "");

  const normTarget = cleanTarget.replace(/\\/g, "/");
  const normOld = cleanOld.replace(/\\/g, "/");

  if (normTarget === normOld) {
    return cleanNew;
  }

  if (normTarget.startsWith(`${normOld}/`)) {
    const sep = targetPath[cleanOld.length] === "\\" ? "\\" : "/";
    const rest = cleanTarget.slice(cleanOld.length + 1);
    return `${cleanNew}${sep}${rest}`;
  }

  return targetPath;
}

/** Updates all stored workflow bindings when a project directory is renamed. */
export function renameProjectBindings(oldProjectPath, newProjectPath) {
  try {
    const map = readProjectRoots();
    let changed = false;
    for (const [id, binding] of Object.entries(map)) {
      if (!binding) continue;
      const normalized = normalizeBinding(binding);
      if (!normalized) continue;
      let { dir, project } = normalized;
      let itemChanged = false;

      if (project) {
        const nextProject = replacePathPrefix(project, oldProjectPath, newProjectPath);
        if (nextProject !== project) {
          project = nextProject;
          itemChanged = true;
        }
      }
      if (dir) {
        const nextDir = replacePathPrefix(dir, oldProjectPath, newProjectPath);
        if (nextDir !== dir) {
          dir = nextDir;
          itemChanged = true;
        }
      }

      if (itemChanged) {
        map[id] = { dir, project };
        changed = true;
      }
    }

    if (changed) {
      globalThis.localStorage?.setItem(PROJECT_ROOTS_KEY, JSON.stringify(map));
    }
    return changed;
  } catch {
    return false;
  }
}

/** The folders a workflow is bound to, or null. */
export function getProjectRootBinding(workflowId) {
  return normalizeBinding(readProjectRoots()[workflowId]);
}

export function createWorkflowId() {
  return `wf-${crypto.randomUUID()}`;
}

export function getCurrentWorkflowId() {
  return getSetting(CURRENT_ID_KEY);
}

export function setCurrentWorkflowId(id) {
  void setSetting(CURRENT_ID_KEY, id).catch(() => {
    // Losing the pointer only means the next session opens the newest workflow.
  });
}

/** Lightweight rows for the workflow picker — graphs are not needed there. */
export async function listWorkflowSummaries() {
  let summaries = null;
  if (typeof db.listWorkflowSummaries === "function") {
    try {
      const res = await db.listWorkflowSummaries();
      if (Array.isArray(res)) summaries = res;
    } catch {
      // Fall through to local fallback on unsupported / unmocked db backends.
    }
  }
  if (!summaries) {
    const all = await listWorkflows();
    summaries = all.map((workflow) => ({
      id: workflow.id,
      name: workflow.name ?? "",
      updatedAt: workflow.updatedAt ?? 0,
      nodeCount: workflow.nodes?.length ?? 0,
      project: workflow.project ?? null,
    }));
  }
  return summaries.map((item) => {
    const binding = getProjectRootBinding(item.id);
    return {
      ...item,
      project: item.project ?? binding?.project ?? null,
    };
  });
}

/** Every image id any stored workflow still points at. */
export async function workflowReferencedImageIds(extraLiveNodes = []) {
  const all = await listWorkflows();
  return new Set([
    ...all.flatMap((workflow) => referencedImageIds(workflow.nodes ?? [])),
    ...referencedImageIds(extraLiveNodes),
  ]);
}

/**
 * Drops image blobs neither a surviving workflow nor the asset library points
 * at.
 *
 * Images are shared storage across documents, so the reference set has to be
 * the union over every workflow — pruning against one document would delete
 * pictures another one is still showing. Library assets are kept on top of
 * that: outliving the node that produced them is the whole point of the
 * library, so a generated picture is only reclaimed once its library row is
 * gone too.
 */
export async function pruneOrphanImages(extraLiveNodes = [], options = {}) {
  const synchronized = await synchronizeImagePublications(
    workflowRetentionExclusion(extraLiveNodes),
  );
  try {
    extraLiveNodes = [...extraLiveNodes, ...synchronized.nodes];
    if (typeof db.pruneOrphans === "function") {
      const reclaimed = await db.pruneOrphans(extraLiveNodes, options);
      if (typeof reclaimed === "number") return reclaimed;
    }
    const referenced = await workflowReferencedImageIds(extraLiveNodes);
    const assetIds = await listAssetIds();
    return await pruneImages([...referenced, ...assetIds], options);
  } finally {
    await synchronized.release();
  }
}

/** Removes a workflow and reclaims the images only it referenced. */
export async function removeWorkflow(id, liveNodes = []) {
  await deleteWorkflow(id);
  await pruneOrphanImages(liveNodes);
}

/**
 * Persists a workflow document, stamping `updatedAt` and `rev` via the db
 * layer. Pass the `rev` this canvas last saw as `expectedRev` to have a
 * conflicting write reported back instead of overwriting another canvas.
 */
export async function persistWorkflow(workflow, options) {
  return saveWorkflow(workflow, options);
}
