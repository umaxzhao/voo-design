import { afterEach, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { registerLoopbackIpc } = createRequire(import.meta.url)("../../electron/lan-loopback-ipc.cjs");
let root, controller;
afterEach(async () => { await controller?.stop(); controller = null; if (root) await rm(root, { recursive: true }); root = null; vi.unstubAllEnvs(); });

it("only allows the owning window to start a loopback server serving its build", async () => {
  root = await mkdtemp(path.join(tmpdir(), "voo-loopback-ipc-"));
  await mkdir(path.join(root, "dist"));
  await writeFile(path.join(root, "dist", "index.html"), "editor-build");
  await writeFile(path.join(root, "private.txt"), "private");
  await symlink(path.join(root, "private.txt"), path.join(root, "dist", "escape.txt"));
  const frame = { url: pathToFileURL(path.join(root, "dist", "index.html")).href };
  const handlers = new Map(), owner = { mainFrame: frame }, window = { webContents: owner };
  controller = registerLoopbackIpc({ handle: (name, fn) => handlers.set(name, fn) }, { getAppPath: () => root, isPackaged: true }, () => window);
  await expect(handlers.get("collab:loopback-start")({ sender: {} })).rejects.toThrow("Untrusted");
  await expect(handlers.get("collab:loopback-start")({ sender: owner })).rejects.toThrow("Untrusted");
  await expect(handlers.get("collab:loopback-start")({ sender: owner, senderFrame: { url: "https://untrusted.invalid/" } })).rejects.toThrow("Untrusted");
  await expect(handlers.get("collab:loopback-start")({ sender: owner, senderFrame: { url: frame.url, isMainFrame: false } })).rejects.toThrow("Untrusted");
  frame.isDestroyed = () => true;
  await expect(handlers.get("collab:loopback-start")({ sender: owner, senderFrame: frame })).rejects.toThrow("Untrusted");
  frame.isDestroyed = () => false;
  frame.url = pathToFileURL(path.join(root, "private.txt")).href;
  await expect(handlers.get("collab:loopback-start")({ sender: owner, senderFrame: frame })).rejects.toThrow("Untrusted");
  frame.url = "https://untrusted.invalid/";
  await expect(handlers.get("collab:loopback-start")({ sender: owner, senderFrame: frame })).rejects.toThrow("Untrusted");
  frame.url = `${pathToFileURL(path.join(root, "dist", "index.html")).href}?r=abcdefgh#k=test`;
  const pending = handlers.get("collab:loopback-start")({ sender: owner, senderFrame: frame });
  frame.url = "https://untrusted.invalid/";
  await expect(pending).rejects.toThrow("Untrusted");
  frame.url = `${pathToFileURL(path.join(root, "dist", "index.html")).href}?r=abcdefgh#k=test`;
  const info = await handlers.get("collab:loopback-start")({ sender: owner, senderFrame: frame });
  expect(info.address).toBe("127.0.0.1");
  const origin = `http://127.0.0.1:${info.port}`;
  expect(await (await fetch(`${origin}/`)).text()).toBe("editor-build");
  for (const name of ["/escape.txt", "/%2e%2e/private.txt", "/private.txt"]) {
    expect((await fetch(`${origin}${name}`)).status).toBe(404);
  }
  await expect(handlers.get("collab:loopback-stop")({ sender: owner, senderFrame: { url: frame.url } })).rejects.toThrow("Untrusted");
  await expect(handlers.get("collab:loopback-stop")({ sender: owner })).rejects.toThrow("Untrusted");
  expect((await fetch(origin)).status).toBe(200);
  await handlers.get("collab:loopback-stop")({ sender: owner, senderFrame: frame });
  await expect(fetch(origin)).rejects.toThrow();
});

it("allows the configured development main frame while rejecting other origins", async () => {
  root = await mkdtemp(path.join(tmpdir(), "voo-loopback-ipc-"));
  await mkdir(path.join(root, "dist"));
  await writeFile(path.join(root, "dist", "index.html"), "editor-build");
  vi.stubEnv("VITE_DEV_SERVER_URL", "http://127.0.0.1:5173/");
  const frame = { url: "http://127.0.0.1:5173/?r=abcdefgh" };
  const owner = { mainFrame: frame }, handlers = new Map();
  controller = registerLoopbackIpc({ handle: (name, fn) => handlers.set(name, fn) }, { getAppPath: () => root, isPackaged: false }, () => ({ webContents: owner }));
  const info = await handlers.get("collab:loopback-start")({ sender: owner, senderFrame: frame });
  frame.url = "http://127.0.0.1:5174/";
  await expect(handlers.get("collab:loopback-stop")({ sender: owner, senderFrame: frame })).rejects.toThrow("Untrusted");
  expect((await fetch(`http://127.0.0.1:${info.port}/`)).status).toBe(200);
  frame.url = "http://127.0.0.1:5173/";
  await handlers.get("collab:loopback-stop")({ sender: owner, senderFrame: frame });
});
