import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import {
  chromeExecutable,
  chromeLaunchArgs,
  ensureChrome,
  usesAutomationFlags,
} from "../../electron/chrome-launcher.js";

const DARWIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("chromeExecutable", () => {
  it("uses the macOS application binary", () => {
    const exists = (candidate) => candidate === DARWIN;
    expect(chromeExecutable({ platform: "darwin", env: {}, exists })).toBe(DARWIN);
  });

  it("prefers LOCALAPPDATA on Windows, then Program Files", () => {
    const local = path.join("C:\\Users\\ning\\AppData\\Local", "Google", "Chrome", "Application", "chrome.exe");
    const program = path.join("C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe");
    expect(
      chromeExecutable({
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\ning\\AppData\\Local", PROGRAMFILES: "C:\\Program Files" },
        exists: (candidate) => candidate === local,
      }),
    ).toBe(local);
    expect(
      chromeExecutable({
        platform: "win32",
        env: { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)" },
        exists: (candidate) => candidate === program,
      }),
    ).toBe(program);
  });

  it("uses google-chrome on Linux", () => {
    expect(
      chromeExecutable({
        platform: "linux",
        env: {},
        exists: (candidate) => candidate === "/usr/bin/google-chrome",
      }),
    ).toBe("/usr/bin/google-chrome");
  });

  it("honors CHROME_PATH when that file exists", () => {
    expect(
      chromeExecutable({
        platform: "linux",
        env: { CHROME_PATH: "/opt/chrome" },
        exists: (candidate) => candidate === "/opt/chrome",
      }),
    ).toBe("/opt/chrome");
  });
});

describe("ensureChrome", () => {
  it("spawns the real browser with the url and no automation flags", () => {
    const spawn = vi.fn(() => ({ unref() {}, on() {} }));
    const result = ensureChrome({
      url: "https://chatgpt.com/",
      platform: "darwin",
      env: {},
      exists: (candidate) => candidate === DARWIN,
      spawn,
    });
    expect(result.executable).toBe(DARWIN);
    expect(result.args).toEqual(chromeLaunchArgs("https://chatgpt.com/"));
    expect(usesAutomationFlags(result.args)).toBe(false);
    expect(spawn).toHaveBeenCalledWith(DARWIN, ["https://chatgpt.com/"], {
      detached: true,
      shell: false,
      stdio: "ignore",
    });
  });

  it("fails with chromeLaunchFailed when Chrome is not installed", () => {
    expect(() =>
      ensureChrome({
        url: "https://gemini.google.com/app",
        platform: "linux",
        env: {},
        exists: () => false,
        spawn: vi.fn(),
      }),
    ).toThrow(expect.objectContaining({ code: "chromeLaunchFailed" }));
  });
});
