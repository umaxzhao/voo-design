import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { errorMessage } from "./dsh-connector-common.js";
import { resolvePrebuiltConnectorDir, copyConnectorTree, rewriteConnectorPatch } from "./dsh-connector-resources.js";

/** The repo root this module was loaded from — the build script's home. */
export function defaultRepoRoot() {
  try {
    return fileURLToPath(new URL("../", import.meta.url));
  } catch {
    return null;
  }
}


export function withPrebuiltContext(message, prebuiltError) {
  return prebuiltError
    ? `${message}（预构建 connector 不可用：${prebuiltError}）`
    : message;
}

/**
 * Creates `<userData>/connectors/voo`, preferring the connector packaged into
 * the app resources. The repository builder remains the fallback and the only
 * path available in development; a packaged asar cannot supply it.
 *
 * @returns {Promise<{ok: true, source: "resource"|"build"}|{ok: false, code: string, error: string}>}
 */
export async function prepareConnector({
  connectorPath,
  prebuiltConnectorDir,
  resourcesPath,
  repoRoot,
  fs: fsImpl,
}) {
  // The builder refuses an existing destination, so replace the previous
  // connector instead of leaving a stale build behind.
  const fresh = () => {
    fsImpl.rmSync?.(connectorPath, { recursive: true, force: true });
    fsImpl.mkdirSync(path.dirname(connectorPath), { recursive: true });
  };

  let prebuiltError = null;
  const prebuiltDir = resolvePrebuiltConnectorDir({
    prebuiltConnectorDir,
    resourcesPath,
    fs: fsImpl,
  });
  if (prebuiltDir) {
    try {
      fresh();
      copyConnectorTree(fsImpl, prebuiltDir, connectorPath);
      // The prebuilt patch has the packaging machine's paths baked in.
      rewriteConnectorPatch({ connectorPath, fs: fsImpl });
      return { ok: true, source: "resource", resourceDir: prebuiltDir };
    } catch (error) {
      prebuiltError = errorMessage(error);
    }
  }

  const root = repoRoot ? path.resolve(repoRoot) : defaultRepoRoot();
  if (!root) {
    return {
      ok: false,
      code: "connectorBuildUnavailable",
      error: withPrebuiltContext("找不到 VOO 仓库根目录，无法构建 connector", prebuiltError),
    };
  }
  const builderPath = path.join(root, "scripts", "build-agent-plugin.mjs");
  let buildPortableConnector;
  try {
    const builder = await import(pathToFileURL(builderPath).href);
    buildPortableConnector = builder?.buildPortableConnector;
  } catch (error) {
    return {
      ok: false,
      code: "connectorBuildUnavailable",
      error: withPrebuiltContext(errorMessage(error), prebuiltError),
    };
  }
  if (typeof buildPortableConnector !== "function") {
    return {
      ok: false,
      code: "connectorBuildUnavailable",
      error: withPrebuiltContext(
        "scripts/build-agent-plugin.mjs 未导出 buildPortableConnector",
        prebuiltError,
      ),
    };
  }

  try {
    fresh();
    await buildPortableConnector({ root, destination: connectorPath });
    if (!fsImpl.existsSync(connectorPath)) {
      throw new Error("connector build produced no output directory");
    }
    return { ok: true, source: "build", repoRoot: root };
  } catch (error) {
    return {
      ok: false,
      code: "connectorBuildFailed",
      error: withPrebuiltContext(errorMessage(error), prebuiltError),
    };
  }
}


export function normalizeExecResult(result) {
  if (result == null) return { code: 0, output: "", timedOut: false, error: null };
  if (typeof result === "string") {
    return { code: 0, output: result, timedOut: false, error: null };
  }
  const output = [result.output, result.stdout, result.stderr]
    .filter((part) => typeof part === "string" && part.trim())
    .join("\n")
    .trim();
  const explicitCode = result.code ?? result.exitCode;
  const code =
    typeof explicitCode === "number"
      ? explicitCode
      : result.ok === false
        ? 1
        : 0;
  return {
    code,
    output,
    timedOut: Boolean(result.timedOut ?? result.timeout),
    error:
      result.error == null
        ? null
        : typeof result.error === "string"
          ? result.error
          : errorMessage(result.error),
  };
}
