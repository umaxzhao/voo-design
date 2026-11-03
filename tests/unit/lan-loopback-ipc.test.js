import { afterEach, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { registerLoopbackIpc } = createRequire(import.meta.url)("../../electron/lan-loopback-ipc.cjs");
let root, controller;
afterEach(async () => { await controller?.stop(); controller = null; if (root) await rm(root, { recursive: true }); root = null; });

it("only allows the owning window to start a loopback server serving its build", async () => {
  root = await mkdtemp(path.join(tmpdir(), "voo-loopback-ipc-"));
  await mkdir(path.join(root, "dist"));
  await writeFile(path.join(root, "dist", "index.html"), "editor-build");
  await writeFile(path.join(root, "private.txt"), "private");
  await symlink(path.join(root, "private.txt"), path.join(root, "dist", "escape.txt"));
  const handlers = new Map(), owner = {}, window = { webContents: owner };
  controller = registerLoopbackIpc({ handle: (name, fn) => handlers.set(name, fn) }, { getAppPath: () => root }, () => window);
  await expect(handlers.get("collab:loopback-start")({ sender: {} })).rejects.toThrow("Untrusted");
  const info = await handlers.get("collab:loopback-start")({ sender: owner });
  expect(info.address).toBe("127.0.0.1");
  const origin = `http://127.0.0.1:${info.port}`;
  expect(await (await fetch(`${origin}/`)).text()).toBe("editor-build");
  for (const name of ["/escape.txt", "/%2e%2e/private.txt", "/private.txt"]) {
    expect((await fetch(`${origin}${name}`)).status).toBe(404);
  }
  await handlers.get("collab:loopback-stop")({ sender: owner });
  await expect(fetch(origin)).rejects.toThrow();
});
