import { afterAll, beforeAll, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let child;
let directory;
let baseUrl;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "voo-upload-test-"));
  child = spawn(process.execPath, ["scripts/signaling-server.mjs"], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", UPLOAD_DIR: directory,
      UPLOAD_MAX_BYTES: "16", VOO_PUBLIC_BASE_URL: "http://127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let errors = "";
    const timer = setTimeout(() => reject(new Error(`Upload server did not start: ${errors}`)), 5000);
    child.stderr.on("data", data => { errors += data; });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", data => {
      const match = String(data).match(/signalling on ws:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); baseUrl = `http://127.0.0.1:${match[1]}`; resolve(); }
    });
  });
});

afterAll(async () => {
  if (child && child.exitCode === null) {
    await new Promise(resolve => { child.once("exit", resolve); child.kill(); });
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("round-trips raw media bytes through an isolated upload directory", async () => {
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const upload = await fetch(`${baseUrl}/upload`, { method: "POST", headers: { "Content-Type": "image/png" }, body: bytes });
  expect(upload.status).toBe(201);
  const { url } = await upload.json();
  const response = await fetch(`${baseUrl}${new URL(url).pathname}`);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});

it("rejects unsupported and oversized uploads", async () => {
  const unsupported = await fetch(`${baseUrl}/upload`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "test" });
  expect(unsupported.status).toBe(415);
  const large = await fetch(`${baseUrl}/upload`, { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array(17) });
  expect(large.status).toBe(413);
});

it("serves SVG as a download with MIME sniffing disabled", async () => {
  const upload = await fetch(`${baseUrl}/upload`, { method: "POST", headers: { "Content-Type": "image/svg+xml" }, body: "<svg/>" });
  const { url } = await upload.json();
  const response = await fetch(`${baseUrl}${new URL(url).pathname}`);
  expect(response.headers.get("content-disposition")).toBe("attachment");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect((await fetch(`${baseUrl}/uploads/unknown.png`)).status).toBe(404);
});
