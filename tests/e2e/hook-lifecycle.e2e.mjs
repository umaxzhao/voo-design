import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => {
    const { setLocale } = await import("/src/shared/i18n.js");
    await setLocale("en");
    window.__hookHarness = await import("/tests/e2e/hook-lifecycle-harness.jsx");
    window.__hookEngine = window.__hookHarness.mountEngineAudit();
  });
  await page.waitForFunction(() => window.__hookEngine.ready);
  await page.evaluate(() => {
    const a = window.__hookEngine;
    a.initialEngine = a.engine;
    a.engine.setDoc({ ...a.engine.getDocument(), nodes: a.engine.getDocument().nodes.map(node => ({ ...node, fill: "#ff0000" })) });
    a.render("latest");
  });
  await settled();
  assert.deepEqual(await page.evaluate(() => {
    const a = window.__hookEngine;
    return { sameEngine: a.engine === a.initialEngine, sources: a.sourceVersions, fill: a.engine.getNode("source-node").fill };
  }), { sameEngine: true, sources: ["first"], fill: "#ff0000" });
  await page.evaluate(() => window.__hookEngine.engine.setColor("#00ff00"));
  await settled();
  assert.equal(await page.evaluate(() => window.__hookEngine.changes.at(-1)), "latest");
  checks.push("source factories and changing callbacks preserve the real engine and edited document while notifications use current callbacks");

  await page.evaluate(() => window.__hookEngine.render("latest", false));
  await page.waitForFunction(() => window.__hookEngine.engine === null);
  assert.equal(await page.evaluate(() => window.__hookEngine.disposals.at(-1)), "latest");
  await page.evaluate(() => window.__hookEngine.render("reopened", true));
  await page.waitForFunction(() => window.__hookEngine.ready);
  assert.deepEqual(await page.evaluate(() => {
    const a = window.__hookEngine;
    return { replaced: a.engine !== a.initialEngine, sources: a.sourceVersions, fill: a.engine.getNode("source-node").fill };
  }), { replaced: true, sources: ["first", "reopened"], fill: "#ff0000" });
  checks.push("deactivation snapshots through the latest callback and reactivation reads a fresh source once while restoring retained edits");

  for (const kind of ["text", "region"]) {
    await page.evaluate(kind => { window.__hookOverlay = window.__hookHarness.mountOverlayAudit(kind); }, kind);
    const input = page.locator("#hook-overlay-audit textarea");
    await input.fill(`Edited ${kind}`);
    await page.evaluate(() => window.__hookOverlay.render("latest"));
    await settled();
    assert.deepEqual(await page.evaluate(() => window.__hookOverlay.commits), []);
    assert.equal(await input.inputValue(), `Edited ${kind}`);
    await page.evaluate(() => window.__hookOverlay.close());
    assert.deepEqual(await page.evaluate(() => window.__hookOverlay.commits), [{ version: "latest", value: `Edited ${kind}` }]);
  }
  checks.push("text and region overlays never commit mid-edit on callback changes and unmount commits the live text through the latest callback");

  await page.evaluate(async () => {
    const { saveStoredSessions } = await import("/src/canvas/agent/session_history.js");
    saveStoredSessions([{ id: "hook-session", title: "Stored", createdAt: 1, updatedAt: 1,
      messages: [{ role: "user", content: "Saved conversation survives initialization" }], history: [{ role: "user", content: "Saved conversation survives initialization" }] }]);
    window.__hookAgent = window.__hookHarness.mountAgentAudit();
  });
  const agent = page.locator("#hook-agent-audit");
  await agent.getByText("Saved conversation survives initialization", { exact: true }).waitFor();
  const newLabel = await page.evaluate(async () => (await import("/src/shared/i18n.js")).t("agent.history.new"));
  await agent.getByRole("button", { name: newLabel, exact: true }).click();
  await page.evaluate(() => window.__hookAgent.render());
  await settled();
  assert.equal(await agent.getByText("Saved conversation survives initialization", { exact: true }).count(), 0);
  await page.evaluate(() => window.__hookAgent.close());
  checks.push("agent bootstrap opens saved history once and a normal rerender cannot replace the user's new conversation");

  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const state = useDesignStore.getState();
    window.__hookSettingsPage = state.editingNodeId;
    window.__hookMainEngine = window.__vooEditors[state.editingNodeId];
    const { setEditorEngineReady } = await import("/src/canvas/editor-engine-events.js");
    setEditorEngineReady(window.__hookMainEngine, false);
    window.__hookSettings = window.__hookHarness.mountSettingsAudit();
  });
  const settings = page.locator("#hook-settings-audit");
  const useLabel = await page.evaluate(async () => (await import("/src/shared/i18n.js")).t("designSystems.use"));
  await settings.getByRole("button", { name: useLabel, exact: true }).waitFor();
  assert.equal(await settings.getByRole("button", { name: useLabel, exact: true }).isDisabled(), true);
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { EDITOR_ENGINE_CHANGE_EVENT, setEditorEngineReady } = await import("/src/canvas/editor-engine-events.js");
    setEditorEngineReady(window.__hookMainEngine, true);
    window.dispatchEvent(new CustomEvent(EDITOR_ENGINE_CHANGE_EVENT, { detail: { nodeId: window.__hookSettingsPage } }));
    // A different preview engine may be the last global publisher; actions must
    // still target the actual focused page's registered engine.
    window.__vooEditor = window.__hookEngine.engine;
  });
  await settings.getByRole("button", { name: useLabel, exact: true }).click();
  assert.deepEqual(await page.evaluate(() => ({ actual: window.__hookMainEngine.getDocument().designSystemId,
    preview: window.__hookEngine.engine.getDocument().designSystemId ?? null })), { actual: "studio", preview: null });
  checks.push("design-system settings react to delayed engine readiness and apply to the focused page rather than a stale global preview");

  const markdown = settings.getByRole("textbox", { name: "designMd", exact: true });
  await markdown.fill("Dirty draft must survive registry and language changes");
  await page.evaluate(async () => {
    const { setLocale } = await import("/src/shared/i18n.js");
    const { saveCustomDesignSystems, listDesignSystems } = await import("/src/canvas/editor/design_system_registry.js");
    const preset = listDesignSystems([])[0];
    await saveCustomDesignSystems([{ id: "custom-hook-audit", name: "External custom", builtIn: false,
      designTokens: preset.designTokens, designMd: "External registry update" }]);
    await setLocale("zh");
  });
  await settled();
  assert.equal(await markdown.inputValue(), "Dirty draft must survive registry and language changes");
  await settings.getByTestId("design-system-item-wellness").click();
  const chinese = await markdown.inputValue();
  await page.evaluate(async () => (await import("/src/shared/i18n.js")).setLocale("en"));
  await settled();
  assert.notEqual(await markdown.inputValue(), chinese);
  assert.equal(await markdown.inputValue(), await page.evaluate(async () =>
    (await import("/src/canvas/editor/design_system_registry.js")).listDesignSystems([]).find(system => system.id === "wellness").designMd));
  checks.push("registry updates and locale changes preserve dirty drafts while pristine built-in briefs follow the current language");
  await page.evaluate(() => {
    window.__hookSettings.close(); window.__hookEngine.close(); window.__vooEditor = window.__hookMainEngine;
  });
  await page.evaluate(() => { window.__hookPage = window.__hookHarness.mountFullPageAudit(); });
  await page.waitForFunction(() => window.__hookPage.entry?.ready);
  assert.equal(await page.evaluate(() => window.__hookPage.entry.engine.sampleColorAt({ x: 4, y: 4 })), "#22cc55");
  checks.push("a page carrying its own image ID resolves the live image map and paints the decoded bitmap");
  await page.evaluate(() => { localStorage.setItem("voo.renderer", "skia"); window.__hookPage.render(); });
  await page.locator('#hook-page-audit [data-testid="skia-canvas"][data-status="ready"]').waitFor({ timeout: 30000 });
  assert.deepEqual(await page.evaluate(() => {
    const twoD = document.querySelector('#hook-page-audit [data-testid="editor-2d-canvas"]');
    const skia = document.querySelector('#hook-page-audit [data-testid="skia-canvas"]');
    return { separate: skia !== twoD, twoDContext: Boolean(twoD.getContext("2d")),
      skiaContext: Boolean(skia.getContext("webgl2") || skia.getContext("webgl")),
      active: skia.dataset.rendererActive };
  }), { separate: true, twoDContext: true, skiaContext: true, active: "true" });
  await page.evaluate(() => window.__hookPage.close());
  checks.push("full-mode Skia initializes on a separate live WebGL canvas while preserving the engine's 2D measurement canvas");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
