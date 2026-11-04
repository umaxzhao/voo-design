import { createAuthoredFrame } from "./authored-frame-fixture.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, reloadModule }) => {
  await createAuthoredFrame(page);
  const keys = ["editor.props.transform", "editor.constraints.title", "editor.props.appearance",
    "editor.props.fillLabel", "editor.props.strokeLabel", "editor.props.effects", "editor.props.exportTitle"];
  const checks = [];
  const panel = page.getByTestId("editor-properties-panel");
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => {
    const locale = await import("/src/shared/i18n.js");
    await locale.setLocale("zh");
    window.__heldTranslator = locale.t;
    const editor = window.__vooEditor;
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const frame = editor.getDocument().nodes.find(node => node.isFrame);
    editor.setDoc({ ...editor.getDocument(), nodes: [frame,
      { ...createRectNode({ x: 100, y: 100, width: 180, height: 120, fill: "#ff0000" }), id: "locale-target", parentId: frame.id }] });
    editor.selectExactly(["locale-target"]);
  });
  await panel.getByText("变换", { exact: true }).waitFor();
  const original = await page.evaluate(() => window.__vooEditor.serialise());
  const snapshot = async timestamp => page.evaluate(async ({ keys, timestamp }) => {
    const runtime = await import(`/src/shared/i18n.js${timestamp ? `?t=${timestamp}` : ""}`);
    return { locale: runtime.getLocale(), current: keys.map(key => runtime.t(key)),
      held: keys.map(key => window.__heldTranslator(key)) };
  }, { keys, timestamp });
  const before = await snapshot();
  for (let index = 0; index < 3; index++) {
    const timestamp = await reloadModule("/src/shared/i18n.js");
    const after = await snapshot(timestamp);
    assert.deepEqual(after.current, before.current, "Re-evaluating the locale module must not turn labels into keys");
    assert.deepEqual(after.held, before.current, "Already mounted components must retain the same dictionary");
    assert.equal(after.locale, "zh");
    await page.evaluate(() => {
      const e = window.__vooEditor;
      e.selectExactly([]); e.selectExactly(["locale-target"]);
    });
    await settle();
    await panel.getByText("变换", { exact: true }).waitFor();
    assert.doesNotMatch(await panel.innerText(), /editor\.(props|constraints|blend)\./i);
  }
  checks.push("three real Vite module replacements retain Chinese labels for old and new module consumers and the mounted inspector");
  for (const failure of [false, true]) {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const pattern = /\/src\/shared\/i18n\/zh\.js(?:\?|$)/;
    const handler = async route => {
      await gate;
      if (failure) await route.abort("failed"); else await route.continue();
    };
    await page.route(pattern, handler);
    const requested = page.waitForRequest(request => pattern.test(request.url()));
    const timestamp = await reloadModule("/src/shared/i18n.js", ["/src/shared/i18n/zh.js"]);
    await requested;
    try {
      assert.deepEqual((await snapshot(timestamp)).current, before.current);
      await panel.getByText("变换", { exact: true }).waitFor();
      assert.doesNotMatch(await panel.innerText(), /editor\.(props|constraints|blend)\./i);
    } finally {
      release();
    }
    const loaded = await page.evaluate(async timestamp => {
      const runtime = await import(`/src/shared/i18n.js?t=${timestamp}`);
      try { await runtime.ensureCurrentLocale(); return true; } catch { return false; }
    }, timestamp);
    assert.equal(loaded, !failure);
    await page.unroute(pattern, handler);
    assert.deepEqual((await snapshot(timestamp)).current, before.current);
    checks.push(`${failure ? "failed" : "delayed"} full-dictionary reload retains every existing inspector label`);
    // Give a failed module a fresh HMR version, as a recovered source update would.
    const recovered = await reloadModule("/src/shared/i18n.js", ["/src/shared/i18n/zh.js"]);
    await page.evaluate(async timestamp => {
      const runtime = await import(`/src/shared/i18n.js?t=${timestamp}`);
      await runtime.ensureCurrentLocale();
    }, recovered);
  }
  for (const locale of ["en", "zh", "en", "zh"]) {
    await page.evaluate(async locale => {
      const runtime = await import("/src/shared/i18n.js");
      await runtime.setLocale(locale);
    }, locale);
    await panel.getByText(locale === "zh" ? "变换" : "Transform", { exact: true }).waitFor();
    assert.doesNotMatch(await panel.innerText(), /editor\.(props|constraints|blend)\./i);
  }
  checks.push("already mounted inspector subscribers continue updating through four language switches after HMR and network recovery");
  await page.clock.install();
  await page.clock.fastForward(10 * 60 * 1000);
  await page.clock.resume();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    const e = window.__vooEditor;
    e.selectExactly([]); e.selectExactly(["locale-target"]);
  });
  await settle();
  assert.deepEqual((await snapshot()).current, before.current);
  await panel.getByText("变换", { exact: true }).waitFor();
  assert.doesNotMatch(await panel.innerText(), /editor\.(props|constraints|blend)\./i);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), original);
  checks.push("ten minutes of editor timers, focus return and selection changes preserve translations and document contents");
  if (process.env.VOO_LOCALE_SCREENSHOT) await page.screenshot({ path: process.env.VOO_LOCALE_SCREENSHOT });
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
