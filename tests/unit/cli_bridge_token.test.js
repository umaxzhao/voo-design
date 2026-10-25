import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { PassThrough } from "node:stream";
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { WebSocketServer } from "ws";

// Set a temporary XDG_CONFIG_HOME before importing modules that resolve config dir
const initialTemp = fs.mkdtempSync(path.join(os.tmpdir(), "voo-pre-test-"));
process.env.XDG_CONFIG_HOME = initialTemp;

import {
  resolveConfigDir,
  tokenFilePath,
  writeBridgeToken,
  readBridgeToken,
} from "../../src/shared/cli_bridge_token.js";
import {
  resolveBridgeToken,
  createMcpStdioServer,
} from "../../electron/mcp_server/stdio_server.js";

describe("CLI Bridge Token Management", () => {
  let tempDir;
  let savedEnv;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "voo-token-test-"));
    savedEnv = {
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      VOO_CLI_BRIDGE_TOKEN: process.env.VOO_CLI_BRIDGE_TOKEN,
      VOO_CLI_BRIDGE_PORT: process.env.VOO_CLI_BRIDGE_PORT,
    };
    process.env.XDG_CONFIG_HOME = tempDir;
    delete process.env.VOO_CLI_BRIDGE_TOKEN;
  });

  afterEach(() => {
    if (savedEnv.XDG_CONFIG_HOME !== undefined) {
      process.env.XDG_CONFIG_HOME = savedEnv.XDG_CONFIG_HOME;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
    if (savedEnv.VOO_CLI_BRIDGE_TOKEN !== undefined) {
      process.env.VOO_CLI_BRIDGE_TOKEN = savedEnv.VOO_CLI_BRIDGE_TOKEN;
    } else {
      delete process.env.VOO_CLI_BRIDGE_TOKEN;
    }
    if (savedEnv.VOO_CLI_BRIDGE_PORT !== undefined) {
      process.env.VOO_CLI_BRIDGE_PORT = savedEnv.VOO_CLI_BRIDGE_PORT;
    } else {
      delete process.env.VOO_CLI_BRIDGE_PORT;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  afterAll(() => {
    try {
      fs.rmSync(initialTemp, { recursive: true, force: true });
    } catch {}
  });

  it("write creates a 0600 file in a temp XDG_CONFIG_HOME with 0700 dir", () => {
    const token = "test-token-mode-600";
    const filePath = writeBridgeToken(token);

    expect(filePath).toBe(path.join(tempDir, "voo-design", "cli-bridge-token"));
    expect(fs.existsSync(filePath)).toBe(true);

    const fileContent = fs.readFileSync(filePath, "utf8");
    expect(fileContent).toBe(`${token}\n`);

    const fileStat = fs.statSync(filePath);
    expect(fileStat.mode & 0o777).toBe(0o600);

    const dirStat = fs.statSync(path.join(tempDir, "voo-design"));
    expect(dirStat.mode & 0o777).toBe(0o700);
  });

  it("read returns the token and handles missing file", () => {
    // Missing file returns null
    expect(readBridgeToken()).toBeNull();

    // Written token is returned trimmed
    writeBridgeToken("  test-read-token  ");
    expect(readBridgeToken()).toBe("test-read-token");
  });

  it("resolveConfigDir and tokenFilePath resolve proper paths", () => {
    expect(resolveConfigDir({ XDG_CONFIG_HOME: "/custom/xdg" })).toBe(
      path.join("/custom/xdg", "voo-design"),
    );
    expect(resolveConfigDir({})).toBe(
      path.join(os.homedir(), ".config", "voo-design"),
    );
    expect(tokenFilePath("/custom/dir")).toBe(
      path.join("/custom/dir", "cli-bridge-token"),
    );
  });

  it("MCP server reads the file when env is missing", async () => {
    const expectedToken = "token-from-file-only-12345";
    writeBridgeToken(expectedToken);
    delete process.env.VOO_CLI_BRIDGE_TOKEN;

    // Direct token resolver should return the file token
    expect(resolveBridgeToken()).toBe(expectedToken);

    // MCP server WebSocket client should pass the token in request header
    let receivedHeader = null;
    const server = http.createServer();
    const wss = new WebSocketServer({ server });
    wss.on("connection", (ws, req) => {
      receivedHeader = req.headers["x-voo-cli-bridge-token"];
      ws.close();
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    process.env.VOO_CLI_BRIDGE_PORT = String(port);

    const mcp = createMcpStdioServer({
      input: new PassThrough(),
      output: new PassThrough(),
    });

    try {
      await mcp.ready().catch(() => {});
      expect(receivedHeader).toBe(expectedToken);
    } finally {
      await mcp.close();
      wss.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("MCP server throws the clear error when neither is present", async () => {
    delete process.env.VOO_CLI_BRIDGE_TOKEN;
    // No token file exists in tempDir

    expect(() => resolveBridgeToken()).toThrow(
      "VOO bridge token not found. Start the VOO desktop app or npm run bridge.",
    );

    const mcp = createMcpStdioServer({
      input: new PassThrough(),
      output: new PassThrough(),
    });

    try {
      await expect(mcp.ready()).rejects.toThrow(
        "VOO bridge token not found. Start the VOO desktop app or npm run bridge.",
      );
    } finally {
      await mcp.close();
    }
  });

  it("MCP server prefers env override over file token", () => {
    writeBridgeToken("token-in-file");
    process.env.VOO_CLI_BRIDGE_TOKEN = "token-in-env";

    expect(resolveBridgeToken()).toBe("token-in-env");
  });
});
