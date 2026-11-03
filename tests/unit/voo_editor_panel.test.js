// Host half of the DeepSeek Harness `voo-editor-panel` bundle.
//
// Covers option resolution, request-path mapping and the real loopback HTTP
// server (port 0, temporary build fixtures). The Client half (rendered iframe
// UI) is out of scope: these tests only prove the Host contract.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BRIDGE_PORT,
  DEFAULT_EDITOR_PORT,
  DEFAULT_EDITOR_URL,
  resolveEditorPanelOptions,
} from "../../plugins/voo/lib/options.js";
import { resolveEditorFile, startEditorServer, wantsHarnessPanel } from "../../plugins/voo/lib/editor-server.js";
import { load as loadYaml } from "js-yaml";

/** `tests/unit/` -> plugin package directory -> the repo root two levels above it. */
const PACKAGE_DIR = fileURLToPath(new URL("../../plugins/voo/", import.meta.url));
const REPO_ROOT = path.resolve(PACKAGE_DIR, "..", "..");

const ENV_KEYS = ["VOO_EDITOR_PANEL_REPO", "VOO_EDITOR_PANEL_DIR"];

const INDEX_MARKER = "VOO_EDITOR_PANEL_FIXTURE_INDEX";
const ASSET_MARKER = "VOO_EDITOR_PANEL_FIXTURE_ASSET";
const INDEX_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>fixture</title></head><body><div id="root">${INDEX_MARKER}</div><script type="module" src="/assets/app-abc123.js"></script></body></html>`;
const ASSET_JS = `export const marker = "${ASSET_MARKER}";\n`;

const tempRoots = [];
const servers = [];
let savedEnv = {};

function tempRoot(prefix = "voo-editor-panel-test-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

/** A minimal built-editor fixture: index.html plus one hashed asset. */
function makeEditorBuild() {
  const editorDir = path.join(tempRoot(), "build");
  fs.mkdirSync(path.join(editorDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(editorDir, "index.html"), INDEX_HTML);
  fs.writeFileSync(path.join(editorDir, "assets", "app-abc123.js"), ASSET_JS);
  return editorDir;
}

async function startServer(editorDirOrOptions) {
  const options = typeof editorDirOrOptions === "string" ? { editorDir: editorDirOrOptions } : editorDirOrOptions;
  const server = await startEditorServer({ host: "127.0.0.1", port: 0, ...options });
  servers.push(server);
  return server;
}

async function closeServer(server) {
  const index = servers.indexOf(server);
  if (index !== -1) servers.splice(index, 1);
  await server.close();
}

/** A single loopback request, bounded so a hung server fails fast instead of timing out the suite. */
async function request(server, urlPath, init = {}) {
  const signal = init.signal ?? AbortSignal.timeout(2000);
  const response = await fetch(`${server.url}${urlPath}`, { ...init, signal });
  return { response, body: await response.text() };
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close().catch(() => {});
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("resolveEditorPanelOptions", () => {
  it("uses the documented loopback defaults", () => {
    expect(DEFAULT_EDITOR_PORT).toBe(4173);
    expect(DEFAULT_BRIDGE_PORT).toBe(4179);

    const options = resolveEditorPanelOptions();
    expect(options).toEqual({
      host: "127.0.0.1",
      port: 4173,
      bridgePort: 4179,
      editorDir: path.join(REPO_ROOT, "dist"),
      editorUrl: "https://voo.run/editor/",
      source: "hosted",
      repoDir: REPO_ROOT,
      bridge: true,
    });
    // The editor build lives two levels above the linked package.
    expect(path.basename(options.editorDir)).toBe("dist");
    expect(path.dirname(options.editorDir)).toBe(REPO_ROOT);
  });

  it("resolves the shipped patch config (blank editorDir) to the repository build", () => {
    const options = resolveEditorPanelOptions({ port: 4173, editorDir: "", bridge: true });
    expect(options.editorDir).toBe(path.join(REPO_ROOT, "dist"));
    expect(options.repoDir).toBe(REPO_ROOT);
    expect(options.port).toBe(4173);
    expect(options.bridge).toBe(true);
  });

  it("honours environment overrides behind blank row values", () => {
    const envRepo = path.join(tempRoot(), "env-repo");
    const envBuild = path.join(tempRoot(), "env-build");
    const rowBuild = path.join(tempRoot(), "row-build");
    process.env.VOO_EDITOR_PANEL_REPO = envRepo;
    process.env.VOO_EDITOR_PANEL_DIR = envBuild;

    // The shipped patch spells `editorDir: ""`; a blank value means "default",
    // so it must not shadow the env override.
    expect(resolveEditorPanelOptions({ repoDir: "", editorDir: "" })).toMatchObject({
      repoDir: envRepo,
      editorDir: envBuild,
    });
    expect(resolveEditorPanelOptions({}).editorDir).toBe(envBuild);
    // An explicit row value still wins over the environment.
    expect(resolveEditorPanelOptions({ editorDir: rowBuild }).editorDir).toBe(rowBuild);

    delete process.env.VOO_EDITOR_PANEL_DIR;
    expect(resolveEditorPanelOptions({ editorDir: "" })).toMatchObject({
      repoDir: envRepo,
      editorDir: path.join(envRepo, "dist"),
    });
  });

  it("defaults bridge on and disables it only for config.bridge === false", () => {
    expect(resolveEditorPanelOptions({}).bridge).toBe(true);
    expect(resolveEditorPanelOptions({ bridge: true }).bridge).toBe(true);
    expect(resolveEditorPanelOptions({ bridge: false }).bridge).toBe(false);
  });

  it("falls back to the default ports for invalid values and keeps valid ones", () => {
    for (const port of ["not-a-port", -1, 0, 1.5, 65536, 70000, Number.NaN]) {
      const options = resolveEditorPanelOptions({ port, bridgePort: port });
      expect(options.port, `port ${String(port)}`).toBe(DEFAULT_EDITOR_PORT);
      expect(options.bridgePort, `bridgePort ${String(port)}`).toBe(DEFAULT_BRIDGE_PORT);
    }
    expect(resolveEditorPanelOptions({ port: "5210", bridgePort: 5211 })).toMatchObject({ port: 5210, bridgePort: 5211 });
  });

  it("honours an absolute editorDir and derives the build under an explicit repoDir", () => {
    const absoluteBuild = path.join(tempRoot(), "somewhere", "custom-dist");
    expect(resolveEditorPanelOptions({ editorDir: absoluteBuild }).editorDir).toBe(absoluteBuild);

    const repoDir = path.join(tempRoot(), "voo-checkout");
    const derived = resolveEditorPanelOptions({ repoDir });
    expect(derived.repoDir).toBe(repoDir);
    expect(derived.editorDir).toBe(path.join(repoDir, "dist"));
  });
});

describe("resolveEditorFile", () => {
  let editorDir;

  beforeEach(() => {
    editorDir = makeEditorBuild();
  });

  it("maps the root, index and hashed assets to build files", () => {
    expect(resolveEditorFile(editorDir, "")).toBe(path.join(editorDir, "index.html"));
    expect(resolveEditorFile(editorDir, "/")).toBe(path.join(editorDir, "index.html"));
    expect(resolveEditorFile(editorDir, "/index.html")).toBe(path.join(editorDir, "index.html"));
    expect(resolveEditorFile(editorDir, "/assets/app-abc123.js")).toBe(path.join(editorDir, "assets", "app-abc123.js"));
  });

  it("falls back to index.html for extension-less SPA routes and directory requests", () => {
    expect(resolveEditorFile(editorDir, "/deep/route")).toBe(path.join(editorDir, "index.html"));
    expect(resolveEditorFile(editorDir, "/deep/route/")).toBe(path.join(editorDir, "index.html"));
    expect(resolveEditorFile(editorDir, "/assets/")).toBe(path.join(editorDir, "index.html"));
  });

  it("returns null for paths that escape the build", () => {
    for (const urlPath of [
      "/../../package.json",
      "/%2e%2e/%2e%2e/package.json",
      "/..%2f..%2fpackage.json",
      "/assets/..%2F..%2F..%2Fpackage.json",
    ]) {
      expect(resolveEditorFile(editorDir, urlPath), urlPath).toBeNull();
    }
  });

  it("returns null for NUL bytes and malformed percent escapes", () => {
    expect(resolveEditorFile(editorDir, "/index.html%00.js")).toBeNull();
    expect(resolveEditorFile(editorDir, "/%E0%A4%A")).toBeNull();
  });
});

describe("startEditorServer", () => {
  it("listens on an ephemeral loopback port and reports the build state", async () => {
    const editorDir = makeEditorBuild();
    const server = await startServer(editorDir);

    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
    expect(server.editorDir).toBe(editorDir);
    expect(server.hasBuild).toBe(true);
    expect(typeof server.close).toBe("function");
  });

  it("serves index.html, hashed assets, SPA routes and 404s", async () => {
    const server = await startServer(makeEditorBuild());

    const index = await request(server, "/");
    expect(index.response.status).toBe(200);
    expect(index.response.headers.get("content-type")).toContain("text/html");
    expect(index.body).toContain(INDEX_MARKER);
    expect(index.response.headers.get("cache-control")).toBe("no-store");

    const asset = await request(server, "/assets/app-abc123.js");
    expect(asset.response.status).toBe(200);
    expect(asset.response.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(asset.body).toContain(ASSET_MARKER);
    expect(asset.response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");

    const deep = await request(server, "/deep/route");
    expect(deep.response.status).toBe(200);
    expect(deep.response.headers.get("content-type")).toContain("text/html");
    expect(deep.body).toContain(INDEX_MARKER);

    const missing = await request(server, "/missing.css");
    expect(missing.response.status).toBe(404);
  });

  it("answers GET/HEAD only and exposes the health endpoint", async () => {
    const server = await startServer(makeEditorBuild());

    const post = await request(server, "/", { method: "POST" });
    expect(post.response.status).toBe(405);
    expect(post.response.headers.get("allow")).toBe("GET, HEAD");
    expect(post.body).toBe("Method Not Allowed");

    const health = await request(server, "/__voo/health");
    expect(health.response.status).toBe(200);
    expect(health.response.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(health.body)).toMatchObject({ ok: true, hasBuild: true });

    const head = await request(server, "/", { method: "HEAD" });
    expect(head.response.status).toBe(200);
    expect(head.response.headers.get("content-type")).toContain("text/html");
    expect(head.body).toBe("");
  });

  it("refuses percent-encoded traversal through the live server", async () => {
    const server = await startServer(makeEditorBuild());
    const result = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: server.port, path: "/..%2f..%2fpackage.json", method: "GET" },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => resolve({ status: res.statusCode, body }));
        },
      );
      req.setTimeout(2000, () => req.destroy(new Error("request timed out")));
      req.on("error", reject);
      req.end();
    });
    expect(result).toEqual({ status: 403, body: "Forbidden" });
  });

  it("refuses connections after close()", async () => {
    const server = await startServer(makeEditorBuild());
    expect((await request(server, "/")).response.status).toBe(200);

    await closeServer(server);

    const refusal = await fetch(`${server.url}/`, { signal: AbortSignal.timeout(2000) }).then(
      () => null,
      (error) => error,
    );
    expect(refusal, "a closed editor server must refuse connections").toBeInstanceOf(Error);
    expect(refusal.name).not.toBe("AbortError");
    expect(String(refusal.cause?.code ?? refusal.code ?? refusal.message)).toContain("ECONNREFUSED");
  });

  it("serves the bilingual build-not-found page when the build is missing", async () => {
    const emptyDir = path.join(tempRoot(), "empty-build");
    fs.mkdirSync(emptyDir);

    const server = await startServer(emptyDir);
    expect(server.hasBuild).toBe(false);

    const page = await request(server, "/");
    expect(page.response.status).toBe(200);
    expect(page.response.headers.get("content-type")).toContain("text/html");
    expect(page.body).toContain("VOO 编辑器尚未构建");
    expect(page.body).toContain("VOO editor build not found");
  });
});

describe("integrated VOO bundle", () => {
  const packageDir = path.join(REPO_ROOT, "plugins", "voo");

  it("declares one bundle carrying the panel Client half and the bridge modules", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
    expect(manifest.name).toBe("voo");
    expect(manifest.dsh.bundle.patch).toBe("./cordis.patch.yml");
    expect(manifest.dsh.client).toMatchObject({
      platform: "web",
      immediately: true,
      inject: ["@deepseek-ai/dsh-client-ui-sidebar-right"],
    });
    for (const key of [".", "./client", "./lib/model-bridge.js", "./locale/*.json", "./icon"]) {
      expect(manifest.exports[key], `exports ${key}`).toBeDefined();
    }
    // The boot graph loads a bundle's Client module by package name, and the
    // iframe asks for the embedded editor explicitly.
    const client = fs.readFileSync(path.join(packageDir, "client.js"), "utf8");
    expect(client).toContain("id: 'voo'");
    expect(client).toContain("?harness=1");
  });

  it("keeps exactly one insert with the panel, canvas MCP and model bridge rows", () => {
    const patch = loadYaml(fs.readFileSync(path.join(packageDir, "cordis.patch.yml"), "utf8"));
    expect(Array.isArray(patch)).toBe(true);
    expect(patch).toHaveLength(1);
    const rows = patch[0].insert;
    expect(rows.map((row) => row.id)).toEqual(["voo-editor-panel", "mcp-voo", "voo-model-bridge"]);

    // The panel row is this package's Host half, anchored beside the patch, so
    // one install mounts both halves whatever directory the bundle sits in.
    expect(rows[0].name).toBe("./index.js");
    expect(fs.existsSync(path.join(packageDir, "index.js"))).toBe(true);
    expect(rows[0].config).toEqual({
      port: 4173,
      editorSource: "hosted",
      editorDir: "",
      editorUrl: "https://voo.run/editor/",
      bridge: true,
    });

    // The canvas MCP client spawns an absolute script entry inside this checkout.
    expect(rows[1].name).toBe("@deepseek-ai/dsh-mcp-client");
    expect(fs.existsSync(rows[1].config.args[0]), rows[1].config.args[0]).toBe(true);
    expect(fs.existsSync(path.join(rows[1].config.cwd, "package.json"))).toBe(true);

    // The model bridge row resolves beside the patch, from inside this package.
    expect(rows[2].name).toBe("./lib/model-bridge.js");
    expect(fs.existsSync(path.join(packageDir, "lib", "model-bridge.js"))).toBe(true);
  });
});

describe("editor source policy", () => {
  async function upstreamFixture() {
    const upstream = http.createServer((request, response) => {
      if (request.url === "/editor/" || request.url === "/editor/index.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<html><body>${INDEX_MARKER}_HOSTED</body></html>`);
        return;
      }
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    });
    await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    return { upstream, editorUrl: `http://127.0.0.1:${upstream.address().port}/editor/` };
  }

  it("uses the hosted web version by default even with a local build", async () => {
    const { upstream, editorUrl } = await upstreamFixture();
    const server = await startServer({ editorDir: makeEditorBuild(), editorUrl, source: "hosted" });
    try {
      expect(server.mode).toBe("proxy");
      const page = await request(server, "/");
      expect(page.body).toContain(`${INDEX_MARKER}_HOSTED`);
      const health = JSON.parse((await request(server, "/__voo/health")).body);
      expect(health).toMatchObject({ mode: "proxy", source: "hosted", hasBuild: true });
    } finally {
      await closeServer(server);
      await new Promise((resolve) => upstream.close(resolve));
    }
  });

  it("keeps the local build for the auto and local source policies", async () => {
    const { upstream, editorUrl } = await upstreamFixture();
    const autoServer = await startServer({ editorDir: makeEditorBuild(), editorUrl, source: "auto" });
    const localServer = await startServer({ editorDir: makeEditorBuild(), editorUrl, source: "local" });
    try {
      expect(autoServer.mode).toBe("local");
      expect(localServer.mode).toBe("local");
      expect((await request(autoServer, "/")).body).toContain(INDEX_MARKER);
      expect((await request(localServer, "/")).body).toContain(INDEX_MARKER);
    } finally {
      await closeServer(autoServer);
      await closeServer(localServer);
      await new Promise((resolve) => upstream.close(resolve));
    }
  });

  it("shows the build guidance page when the local policy has no build", async () => {
    const { upstream, editorUrl } = await upstreamFixture();
    const emptyDir = path.join(tempRoot(), "empty-build");
    fs.mkdirSync(emptyDir);
    const server = await startServer({ editorDir: emptyDir, editorUrl, source: "local" });
    try {
      expect(server.mode).toBe("missing");
      const page = await request(server, "/");
      expect(page.response.status).toBe(200);
      expect(page.body).toContain("VOO 编辑器尚未构建");
      expect(page.body).not.toContain(`${INDEX_MARKER}_HOSTED`);
    } finally {
      await closeServer(server);
      await new Promise((resolve) => upstream.close(resolve));
    }
  });
});

describe("standalone (app-less) editor source", () => {
  it("defaults to the hosted editor and accepts overrides", () => {
    expect(DEFAULT_EDITOR_URL).toBe("https://voo.run/editor/");
    expect(resolveEditorPanelOptions().editorUrl).toBe(DEFAULT_EDITOR_URL);
    expect(resolveEditorPanelOptions({ editorUrl: "https://example.test/editor" }).editorUrl).toBe("https://example.test/editor/");
    expect(resolveEditorPanelOptions({ editorUrl: "off" }).editorUrl).toBeNull();
    // Source policy: the web version by default, local build on request, auto
    // for a local-first dev preview.
    expect(resolveEditorPanelOptions().source).toBe("hosted");
    expect(resolveEditorPanelOptions({ editorSource: "auto" }).source).toBe("auto");
    expect(resolveEditorPanelOptions({ editorSource: "local" }).source).toBe("local");
    expect(resolveEditorPanelOptions({ editorSource: "weird" }).source).toBe("hosted");
    process.env.VOO_EDITOR_PANEL_URL = "https://env.test/editor/";
    try {
      expect(resolveEditorPanelOptions({}).editorUrl).toBe("https://env.test/editor/");
      expect(resolveEditorPanelOptions({ editorUrl: "off" }).editorUrl).toBeNull();
    } finally {
      delete process.env.VOO_EDITOR_PANEL_URL;
    }
  });

  it("proxies the hosted editor when no local build exists", async () => {
    const upstream = http.createServer((request, response) => {
      if (request.url === "/editor/" || request.url === "/editor/index.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<html><body>${INDEX_MARKER}_UPSTREAM</body></html>`);
        return;
      }
      if (request.url === "/editor/assets/app-abc123.js") {
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        response.end(`export const marker = "${ASSET_MARKER}";`);
        return;
      }
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    });
    await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const emptyDir = path.join(tempRoot(), "empty-build");
    fs.mkdirSync(emptyDir);
    const server = await startServer({ editorDir: emptyDir, editorUrl: `http://127.0.0.1:${upstream.address().port}/editor/` });
    try {
      expect(server.mode).toBe("proxy");
      expect(server.hasBuild).toBe(false);
      const health = await request(server, "/__voo/health");
      expect(JSON.parse(health.body)).toMatchObject({ ok: true, mode: "proxy", hasBuild: false });

      const root = await request(server, "/");
      expect(root.response.status).toBe(200);
      expect(root.response.headers.get("content-type")).toContain("text/html");
      expect(root.response.headers.get("cache-control")).toBe("no-store");
      expect(root.body).toContain(INDEX_MARKER);

      const asset = await request(server, "/assets/app-abc123.js");
      expect(asset.response.status).toBe(200);
      expect(asset.response.headers.get("content-type")).toContain("javascript");
      expect(asset.body).toContain(ASSET_MARKER);

      // Extension-less routes are SPA paths and fall back to the hosted entry.
      const spa = await request(server, "/deep/route");
      expect(spa.body).toContain(INDEX_MARKER);

      const missing = await request(server, "/missing.css");
      expect(missing.response.status).toBe(404);
    } finally {
      await closeServer(server);
      await new Promise((resolve) => upstream.close(resolve));
    }
  });

  it("shows a readable page when the hosted editor is unreachable", async () => {
    const emptyDir = path.join(tempRoot(), "empty-build");
    fs.mkdirSync(emptyDir);
    // Reserve then release a port so nothing answers there.
    const probe = http.createServer(() => {});
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const deadPort = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const server = await startServer({ editorDir: emptyDir, editorUrl: `http://127.0.0.1:${deadPort}/editor/` });
    try {
      const page = await request(server, "/");
      expect(page.response.status).toBe(502);
      expect(page.body).toContain("无法加载 VOO 编辑器");
      expect(page.body).toContain("Could not reach the hosted VOO editor");
    } finally {
      await closeServer(server);
    }
  });
});

describe("harness panel navigation", () => {
  it("upgrades embed navigations to the full-chrome panel mode", () => {
    expect(wantsHarnessPanel("?embed", "text/html,application/xhtml+xml")).toBe(true);
    expect(wantsHarnessPanel("?embed=1", "text/html")).toBe(true);
    expect(wantsHarnessPanel("?minimal", "text/html")).toBe(true);
    expect(wantsHarnessPanel("?embed=1&harness=1", "text/html")).toBe(false);
    expect(wantsHarnessPanel("?harness=1", "text/html")).toBe(false);
    expect(wantsHarnessPanel("?embed", "*/*")).toBe(false);
    expect(wantsHarnessPanel("", "text/html")).toBe(false);
  });

  it("redirects an embed document request and keeps harness pages untouched", async () => {
    const server = await startServer(makeEditorBuild());
    try {
      const redirected = await fetch(`${server.url}/?embed=1`, {
        headers: { accept: "text/html" },
        redirect: "manual",
      });
      expect(redirected.status).toBe(302);
      expect(redirected.headers.get("location")).toBe("/?harness=1");

      const harness = await fetch(`${server.url}/?harness=1`, {
        headers: { accept: "text/html" },
      });
      expect(harness.status).toBe(200);
      expect(await harness.text()).toContain(INDEX_MARKER);

      const asset = await fetch(`${server.url}/assets/app-abc123.js`, {
        headers: { accept: "*/*" },
        redirect: "manual",
      });
      expect(asset.status).toBe(200);
    } finally {
      await closeServer(server);
    }
  });
});
