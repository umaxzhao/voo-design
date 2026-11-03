import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";
import { startLoopbackSignaling } from "../../electron/lan-loopback-signaling.js";

const editor = await startEditorBrowserServer();
const browser = await chromium.launch({ headless: true });
const contexts = [];
let service, failFirstStart = true;
try {
  const hostContext = await browser.newContext(); contexts.push(hostContext);
  await hostContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin: editor.origin });
  const host = await hostContext.newPage();
  await host.exposeBinding("startTestLoopback", async () => {
    if (failFirstStart) { failFirstStart = false; throw new Error("EADDRINUSE"); }
    service = await startLoopbackSignaling({ staticRoot: path.resolve("dist") });
    return { address: service.address, port: service.port, room: service.room,
      hostToken: service.hostToken, guestToken: service.guestToken };
  });
  await host.exposeBinding("stopTestLoopback", async () => {
    if (service) { const current = service; service = null; await current.close(); }
  });
  await host.goto(`${editor.origin}/?voo-test=1`, { waitUntil: "domcontentloaded" });
  await host.getByTestId("editor-top-bar").waitFor();
  await host.keyboard.press("Control+n");
  await host.waitForFunction(() => window.__vooEditor?.getDocument);
  await host.evaluate(() => {
    window.vooDesktop = { ...window.vooDesktop, loopbackCollab: {
      start: () => window.startTestLoopback(), stop: () => window.stopTestLoopback(),
    } };
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), isCanvasRoot: true, nodes: [
      { id: "ui-local-node", kind: "rect", x: 80, y: 80, width: 40, height: 40, fill: "#ff0000", visible: true },
    ] });
  });
  await host.getByRole("button", { name: "Share", exact: true }).click();
  await host.getByRole("button", { name: "Start local sharing" }).click();
  await host.getByRole("alert").filter({ hasText: "EADDRINUSE" }).waitFor();
  await host.getByRole("button", { name: "Start local sharing" }).click();
  const input = host.getByRole("textbox", { name: "This computer only" });
  await input.waitFor();
  const link = await input.inputValue();
  await input.locator("..").getByRole("button", { name: "Copy" }).click();
  assert.equal(await host.evaluate(() => navigator.clipboard.readText()), link);
  const parsed = new URL(link);
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.searchParams.get("local"), "1");
  assert.match(new URLSearchParams(parsed.hash.slice(1)).get("k"), /^[A-Za-z0-9_-]{22}$/);
  const guestContext = await browser.newContext(); contexts.push(guestContext);
  await guestContext.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const guest = await guestContext.newPage();
  await guest.goto(link, { waitUntil: "domcontentloaded" });
  await guest.waitForFunction(() => window.__vooEditor?.getDocument()?.nodes.some(node => node.id === "ui-local-node"));
  await host.getByRole("button", { name: "View only", exact: true }).click();
  await guest.getByRole("button", { name: "Sharing: click for the link" }).click();
  const readonly = guest.getByText("You have view-only access. This shared workflow is not editable.", { exact: true });
  await readonly.waitFor();
  await host.getByRole("button", { name: "Edit", exact: true }).click();
  await readonly.waitFor({ state: "hidden" });
  await host.getByRole("button", { name: "Stop local sharing" }).click();
  await host.getByRole("button", { name: "Start local sharing" }).waitFor();
  assert.equal(service, null);
  console.log(JSON.stringify({ passed: "real panel starts, shares and stops the loopback service; guest opens the generated link" }));
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  if (service) await service.close();
  await editor.close();
}
