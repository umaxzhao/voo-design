import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CommandPoolError, releaseBrowserConcurrency, runCommandPool } from "../../scripts/release-command-pool.mjs";

const command = (code, ...args) => [process.execPath, ["--input-type=module", "-e", code, "--", ...args]];
const childPrelude = `
import { writeFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
const directory = process.argv[1], id = Number(process.argv[2]);
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Child synchronization timed out");
    await wait(5);
  }
}
async function exists(name) {
  try { await access(join(directory, name)); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
`;

describe("release command pool", () => {
  it("keeps three browser suites as the default schedule", () => {
    expect(releaseBrowserConcurrency(undefined)).toBe(3);
  });
  it.each(["1", "2", "3"])("accepts an explicit bounded schedule %s", value => {
    expect(releaseBrowserConcurrency(value)).toBe(Number(value));
  });
  it.each(["", "0", "4", "1.5", "invalid", "Infinity", "NaN"])("rejects invalid schedule %s", value => {
    expect(() => releaseBrowserConcurrency(value)).toThrow(RangeError);
  });
  it("runs three real commands concurrently, keeps the bound and returns ordered complete logs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "voo-release-pool-"));
    try {
      const code = `${childPrelude}
console.log(JSON.stringify({ id, phase: "start", time: Date.now() }));
await writeFile(join(directory, id + ".ready"), "ready");
if (id < 3) await until(async () => (await readdir(directory)).filter(name => name.endsWith(".ready")).length >= 3);
await wait(id < 3 ? 80 : 10);
console.error("stderr-" + id);
console.log(JSON.stringify({ id, phase: "end", time: Date.now() }));
`;
      const reported = [];
      const results = await runCommandPool(Array.from({ length: 5 }, (_, id) => command(code, directory, String(id))), {
        concurrency: 3, onComplete: result => reported.push(result),
      });
      expect(results.map(result => result.index)).toEqual([0, 1, 2, 3, 4]);
      expect(reported).toHaveLength(5);
      const events = results.flatMap(result => result.stdout.trim().split("\n").map(line => JSON.parse(line)))
        .sort((left, right) => left.time - right.time || (left.phase === "end" ? -1 : 1));
      let running = 0, maximum = 0;
      for (const event of events) {
        running += event.phase === "start" ? 1 : -1;
        maximum = Math.max(maximum, running);
        expect(running).toBeLessThanOrEqual(3);
      }
      expect(maximum).toBe(3);
      expect(running).toBe(0);
      results.forEach((result, id) => {
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe(`stderr-${id}\n`);
        expect(result.output).toContain(`stderr-${id}\n`);
        expect(result.durationMs).toBeGreaterThan(0);
      });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 10000);

  it("stops queued work on a real failure and waits for the other process to clean up", async () => {
    const directory = await mkdtemp(join(tmpdir(), "voo-release-failure-"));
    try {
      const code = `${childPrelude}
if (id === 0) {
  await writeFile(join(directory, "started"), "yes");
  await until(() => exists("failed"));
  await wait(150);
  await writeFile(join(directory, "cleaned"), "yes");
  console.log("cleanup-complete");
} else if (id === 1) {
  await until(() => exists("started"));
  console.error("expected-child-failure");
  await writeFile(join(directory, "failed"), "yes");
  process.exit(7);
} else {
  await writeFile(join(directory, "must-not-start"), "bad");
}
`;
      const reported = [];
      let failure;
      try {
        await runCommandPool(Array.from({ length: 3 }, (_, id) => command(code, directory, String(id))), {
          concurrency: 2, onComplete: result => reported.push(result),
        });
      } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(CommandPoolError);
      expect(failure.results.map(result => result.index)).toEqual([0, 1]);
      expect(failure.results.map(result => result.exitCode)).toEqual([0, 7]);
      expect(failure.results[1].stderr).toBe("expected-child-failure\n");
      expect(failure.results[0].stdout).toBe("cleanup-complete\n");
      expect(reported).toHaveLength(2);
      expect(await readFile(join(directory, "cleaned"), "utf8")).toBe("yes");
      await expect(readFile(join(directory, "must-not-start"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 10000);

  it("reports spawn errors instead of counting a missing command as a passing step", async () => {
    const reported = [];
    let failure;
    try {
      await runCommandPool([[join(tmpdir(), "voo-no-such-release-command"), []]], {
        onComplete: result => reported.push(result),
      });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(CommandPoolError);
    expect(reported).toHaveLength(1);
    expect(reported[0].exitCode).not.toBe(0);
    expect(reported[0].error).toMatchObject({ code: "ENOENT" });
    expect(failure.results).toEqual(reported);
  });

  it("propagates reporting failures without launching queued commands", async () => {
    const reportError = new Error("report-write-failed");
    let failure;
    try {
      await runCommandPool([command('console.log("first")'), command('process.exit(9)')], {
        concurrency: 1, onComplete: () => { throw reportError; },
      });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(CommandPoolError);
    expect(failure.results).toHaveLength(1);
    expect(failure.results[0].stdout).toBe("first\n");
    expect(failure.reportingErrors).toEqual([reportError]);
    expect(failure.cause.errors).toEqual([reportError]);
  });
});
