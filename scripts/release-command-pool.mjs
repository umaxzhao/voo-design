import { spawn } from "node:child_process";

/** Capture a whole command log before publishing it, without mixing suite lines. */
function runCommand([command, args], onFailure) {
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = "", stderr = "", output = "", error;
    let child;
    const finish = (exitCode, signal) => resolve({
      command: [command, ...args], exitCode, signal,
      durationMs: Date.now() - started, stdout, stderr, output,
      ...(error ? { error: { name: error.name, code: error.code, message: error.message } } : {}),
    });
    try { child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); }
    catch (failure) { error = failure; onFailure(); finish(null, null); return; }
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; output += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; output += chunk; });
    child.once("error", (failure) => { error = failure; onFailure(); });
    child.once("exit", (code, signal) => { if (code !== 0 || signal) onFailure(); });
    child.once("close", finish);
  });
}

/** Failures retain completed results while leaving in-flight commands time to clean up. */
export class CommandPoolError extends Error {
  constructor(results, callbackErrors = []) {
    const failed = results.filter((result) => result.exitCode !== 0 || result.error);
    super(`Release command pool failed (${failed.length} command failures, ${callbackErrors.length} reporting failures)`,
      callbackErrors.length ? { cause: new AggregateError(callbackErrors, "Failed to report release command results") } : undefined);
    this.name = "CommandPoolError";
    Object.defineProperty(this, "results", { value: results });
    Object.defineProperty(this, "reportingErrors", { value: callbackErrors });
  }
}

/** Scheduling may be reduced on busy hosts without changing tests or thresholds. */
export function releaseBrowserConcurrency(value) {
  const concurrency = value === undefined ? 3 : Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
    throw new RangeError("Release browser concurrency must be an integer from 1 to 3");
  }
  return concurrency;
}

/** Run a bounded pool; a failed process never starts another queued command. */
export async function runCommandPool(commands, { concurrency = 3, onComplete = () => {} } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
    throw new RangeError("Release command concurrency must be an integer from 1 to 3");
  }
  for (const entry of commands) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !Array.isArray(entry[1]) ||
      entry[1].some((value) => typeof value !== "string")) {
      throw new TypeError("Release commands must be [command, string arguments] entries");
    }
  }
  let next = 0, stopped = false;
  const completed = [], reportingErrors = [];
  const fail = () => { stopped = true; };
  const worker = async () => {
    while (!stopped && next < commands.length) {
      const index = next++;
      const result = { index, ...await runCommand(commands[index], fail) };
      completed.push(result);
      try { await onComplete(result); }
      catch (error) { fail(); reportingErrors.push(error); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, commands.length) }, worker));
  completed.sort((left, right) => left.index - right.index);
  if (reportingErrors.length || completed.some((result) => result.exitCode !== 0 || result.error)) {
    throw new CommandPoolError(completed, reportingErrors);
  }
  return completed;
}
