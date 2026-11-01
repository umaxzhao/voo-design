import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** One live document; actions use UI events, engine access only observes results. */
export async function creationSession(page, name = "creation") {
  const directory = process.env.VOO_CREATION_AUDIT_DIR ?? join(tmpdir(), "voo-continuous-creation");
  await mkdir(directory, { recursive: true });
  const steps = [];
  await page.evaluate(() => {
    const probe = { steps: [], longTasks: [], inputEvents: [], frameGaps: [] };
    window.__creationProbe = probe;
    const observers = [];
    for (const type of ["longtask", "event"]) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      const observer = new PerformanceObserver(list => {
        const destination = type === "event" ? probe.inputEvents : probe.longTasks;
        for (const entry of list.getEntries()) if (destination.length < 200) {
          destination.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ type, buffered: false, ...(type === "event" ? { durationThreshold: 16 } : {}) });
      observers.push(observer);
    }
    let frame, previous;
    const tick = now => {
      if (previous && now - previous > 34 && probe.frameGaps.length < 200) {
        probe.frameGaps.push({ startTime: previous, duration: now - previous });
      }
      previous = now; frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    probe.stop = () => { cancelAnimationFrame(frame); observers.forEach(observer => observer.disconnect()); };
  });
  const snapshot = () => page.evaluate(() => window.__vooEditor.serialise());
  const node = id => page.evaluate(id => window.__vooEditor.getNode(id), id);
  const selected = () => page.evaluate(() => window.__vooEditor.getSelectedIds());
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const client = point => page.evaluate(point => {
    const r = document.querySelector("[data-editor-artboard]").getBoundingClientRect(), doc = window.__vooEditor.getDocument();
    return { x: r.left + point.x * r.width / doc.width, y: r.top + point.y * r.height / doc.height };
  }, point);
  const click = async (point, options = {}) => { const p = await client(point); await page.mouse.click(p.x, p.y, options); await settle(); };
  const drag = async (from, to) => {
    const a = await client(from), b = await client(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up(); await settle();
  };
  const key = name => page.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+${name}`);
  const tool = async (key, expected, radial = false) => {
    await page.keyboard.down(key);
    if (radial) await page.getByRole("menu").waitFor();
    await page.keyboard.up(key); await settle();
    assert.equal(await page.evaluate(() => window.__vooEditor.getTool()), expected, `Key ${key} must arm ${expected}`);
  };
  const layer = async id => {
    // Row whitespace can sit between the thumbnail and name at shallow depth.
    // Use the actual name button so the fixture always exercises row selection.
    await page.locator(`[data-layer-row-id="${id}"]`).locator("button.flex-1").first().click();
    await settle();
  };
  const pick = async (file, point) => {
    const before = await snapshot(); await click(point, { button: "right" });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("editor-menu-import-media").click()]);
    await chooser.setFiles(file);
    await page.waitForFunction(ids => window.__vooEditor.getDocument().nodes.some(n => !ids.includes(n.id)), before.nodes.map(n => n.id));
    await settle();
    return (await snapshot()).nodes.filter(n => !before.nodes.some(old => old.id === n.id));
  };
  const pixel = async point => { await settle(); return page.evaluate(p => window.__vooEditor.sampleColorAt(p), point); };
  const write = async () => {
    const diagnostic = await page.evaluate(() => {
      const { steps, longTasks, inputEvents, frameGaps } = window.__creationProbe;
      return { steps, longTasks, inputEvents, frameGaps };
    });
    await writeFile(join(directory, `${name}.json`), JSON.stringify({
      scope: "One real UI document; timings include test verification and are diagnostic, not a hardware FPS or competitor benchmark",
      steps, diagnostic,
    }, null, 2));
  };
  const step = async (name, run) => {
    const timing = await page.evaluate(name => {
      const timing = { name, startTime: performance.now() }; window.__creationProbe.steps.push(timing); return timing;
    }, name);
    try { await run(); steps.push({ name, status: "passed" }); }
    catch (error) {
      steps.push({ name, status: "failed", error: error.stack });
      await page.screenshot({ path: join(directory, `${name}-failure.png`) });
      if (await page.evaluate(() => Boolean(window.__vooEditor))) {
        await writeFile(join(directory, `${name}-failure-document.json`), JSON.stringify(await snapshot(), null, 2));
      }
      throw error;
    } finally {
      await page.evaluate(timing => {
        window.__creationProbe.steps.find(step => step.startTime === timing.startTime).endTime = performance.now();
      }, timing);
      await write(); console.log(`continuous-creation: ${name}: ${steps.at(-1).status}`);
    }
  };
  const finish = async () => {
    await page.screenshot({ path: join(directory, `${name}-completed.png`) });
    await page.evaluate(() => window.__creationProbe.stop()); await write();
  };
  return { step, finish, snapshot, node, selected, settle, client, click, drag, key, tool, layer, pick, pixel };
}
