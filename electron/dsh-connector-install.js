import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DSH_CONNECTOR_DIRNAME, DSH_DEFAULT_PROFILE, DSH_INSTALL_TIMEOUT_MS, envOf, homeOf, errorMessage, pickTargetProfile, dshInstallCommand } from "./dsh-connector-common.js";
import { defaultUserDataDir, readDshStatus } from "./dsh-connector-detection.js";
import { findDshBinary } from "./dsh-connector-binary.js";
import { prepareConnector, normalizeExecResult } from "./dsh-connector-prepare.js";

/** Runs the CLI, bounded by `timeoutMs`; never rejects. */
export function runCommand(bin, args, { cwd, env, timeoutMs = DSH_INSTALL_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ code: null, output: "", timedOut: false, error });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
      finish({ code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) =>
      finish({ code: null, stdout, stderr, timedOut: false, error }),
    );
    child.on("close", (code) =>
      finish({ code, stdout, stderr, timedOut: false }),
    );
  });
}

/**
 * Builds the connector into `<userData>/connectors/voo` and installs it
 * into a DSH profile with `dsh plugin add link:<dir>`.
 *
 * Never throws: every failure is a structured `{ ok: false, code, ... }` so the
 * UI can fall back to showing the manual command.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   connectorPath: string,
 *   command: string,
 *   output?: string,
 *   error?: string,
 *   code?: string,
 * }>}
 */
export async function installDshConnector({
  repoRoot,
  resourcesPath,
  prebuiltConnectorDir,
  userDataDir,
  home,
  platform = process.platform,
  env = process.env,
  exec,
  findBinary,
  profile,
  fs: fsImpl = fs,
} = {}) {
  const envObject = envOf(env);
  const homeDir = homeOf(home, envObject);
  const resolvedUserDataDir =
    userDataDir ||
    defaultUserDataDir({
      home: homeDir,
      platform,
      env: envObject,
      fs: fsImpl,
    });
  const connectorPath = path.join(
    resolvedUserDataDir,
    "connectors",
    DSH_CONNECTOR_DIRNAME,
  );
  let status;
  try {
    status = readDshStatus({
      userDataDir: resolvedUserDataDir,
      home: homeDir,
      platform,
      env: envObject,
      fs: fsImpl,
    });
  } catch (error) {
    return {
      ok: false,
      connectorPath,
      command: dshInstallCommand(connectorPath, DSH_DEFAULT_PROFILE),
      code: "connectorStatusUnavailable",
      error: errorMessage(error),
    };
  }
  const targetProfile = pickTargetProfile(status.profiles, profile);
  const command = dshInstallCommand(connectorPath, targetProfile);
  const failure = (code, error) => ({
    ok: false,
    connectorPath,
    command,
    code,
    error,
  });

  const prepared = await prepareConnector({
    connectorPath,
    prebuiltConnectorDir,
    resourcesPath,
    repoRoot,
    fs: fsImpl,
  });
  if (!prepared.ok) {
    return failure(prepared.code, prepared.error);
  }

  const bin =
    typeof findBinary === "function"
      ? findBinary({
          home: homeDir,
          platform,
          env: envObject,
          appPath: status.appPath,
        })
      : findDshBinary({
          home: homeDir,
          platform,
          env: envObject,
          appPath: status.appPath,
        });
  if (!bin) {
    return failure(
      "dshCliNotFound",
      "未找到 dsh CLI，请先在终端安装 DeepSeek Harness CLI，或直接执行上面的命令",
    );
  }

  // `dsh plugin` is a required-option command, not a bare pnpm forward: on the
  // bundled desktop CLI (0.2.1-rc.3) `dsh plugin add link:<dir>` exits 1 with
  // "error: required option '--profile <name>' not specified", while
  // `dsh plugin --profile desktop add link:<dir>` installs and links the
  // package (verified on this machine). The option must precede the forwarded
  // pnpm args; after them it is no longer parsed.
  //
  // The bare form is still tried as a fallback below: a dsh build that no
  // longer knows `--profile` must not turn the one-click install into a hard
  // failure over an option it rejects.
  const args = (withProfile) => [
    "plugin",
    ...(withProfile ? ["--profile", targetProfile] : []),
    "add",
    `link:${connectorPath}`,
  ];
  const runner = typeof exec === "function" ? exec : runCommand;
  const run = async (withProfile) => {
    try {
      return normalizeExecResult(
        await runner(bin, args(withProfile), {
          cwd: homeDir,
          env: envObject,
          timeoutMs: DSH_INSTALL_TIMEOUT_MS,
        }),
      );
    } catch (error) {
      return { code: null, output: "", timedOut: false, error: errorMessage(error) };
    }
  };
  let result = await run(true);
  if (result.code !== 0 && !result.error && /unknown (?:option|argument)/i.test(result.output)) {
    result = await run(false);
  }
  if (result.timedOut) {
    return {
      ok: false,
      connectorPath,
      command,
      code: "dshInstallTimeout",
      error: "dsh plugin add 超时",
      output: result.output,
    };
  }
  if (result.error) {
    return {
      ok: false,
      connectorPath,
      command,
      code: "dshInstallFailed",
      error: result.error,
      output: result.output,
    };
  }
  if (result.code !== 0) {
    return {
      ok: false,
      connectorPath,
      command,
      code: "dshPluginAddFailed",
      error: result.output || `dsh plugin add exited with code ${result.code}`,
      output: result.output,
    };
  }
  return {
    ok: true,
    connectorPath,
    command,
    profile: targetProfile,
    source: prepared.source,
    output: result.output,
  };
}
