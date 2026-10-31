import assert from "node:assert/strict";

/** Actual inspector controls, engine geometry/history, and responsive captions. */
export async function runTypographyCases({ page, tool, mark, evidence }) {
  const panel = page.getByTestId("editor-properties-panel");
  const section = page.getByTestId("text-typography-section");
  const node = (id = "type-title") => page.evaluate(id => window.__vooEditor.getNode(id), id);
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metric = name => section.getByRole("spinbutton", { name: new RegExp(`^${name}`) });
  const change = async (name, value) => {
    const field = metric(name); await field.fill(String(value)); await field.press("Enter"); await settle();
  };
  await page.evaluate(async () => {
    const { createTextNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), width: 1000, height: 700, isCanvasRoot: true, nodes: [
      { ...createTextNode({ x: 100, y: 100, text: "Make room for better ideas.\nDesign with clarity.", fontSize: 32, fill: "#ffffff" }), id: "type-title", name: "Typography heading" },
      { ...createTextNode({ x: 100, y: 300, text: "Readable body copy", fontSize: 20, fill: "#ffffff" }), id: "type-body", name: "Typography body", lineHeight: 1.6, letterSpacing: 1 },
    ] });
    e.selectExactly(["type-title"]);
  });
  await section.waitFor();
  const original = await node();
  for (const label of ["Font family", "Font weight", "Font size", "Line height", "Letter spacing", "Formatting", "Alignment", "Text box"]) {
    await section.getByText(label, { exact: true }).waitFor({ state: "visible" });
  }
  for (const icon of await section.locator("svg:visible").all()) {
    const size = await icon.evaluate(element => ({ width: element.getBoundingClientRect().width, stroke: parseFloat(getComputedStyle(element).strokeWidth), viewBox: element.viewBox.baseVal.width }));
    assert.equal(size.width, 16);
    assert.ok(Math.abs(size.stroke * size.width / size.viewBox - 1.5) < 0.01, "actual icon strokes must be 1.5 CSS px");
  }
  await change("Font size", 40);
  assert.equal((await node()).fontSize, 40);
  assert.ok((await node()).width > original.width, "font size must change actual text geometry");
  await metric("Font size").fill("54"); await metric("Font size").press("Escape"); await settle();
  assert.equal((await node()).fontSize, 40);
  await tool("undo"); assert.equal((await node()).fontSize, original.fontSize);
  await tool("redo"); assert.equal((await node()).fontSize, 40);
  await tool("undo");
  await change("Line height", 150);
  assert.equal((await node()).lineHeight, 1.5);
  assert.ok((await node()).height > original.height, "percentage line height must affect rendered text bounds");
  await tool("undo");
  await change("Letter spacing", 2.5);
  assert.equal((await node()).letterSpacing, 2.5);
  assert.ok((await node()).width > original.width);
  await tool("undo");
  mark("typography captions and Lucide icons are readable; size/line-height/tracking change actual geometry, cancel correctly and undo/redo once");

  await section.getByRole("button", { name: "Font weight", exact: true }).click();
  await page.getByRole("option", { name: "Bold", exact: true }).click();
  assert.equal(String((await node()).fontWeight), "700"); await tool("undo");
  for (const [name, key, value] of [["Italic", "italic", true], ["Underline", "underline", true], ["Align center", "align", "center"]]) {
    await section.getByRole("button", { name, exact: true }).click();
    assert.equal((await node())[key], value); await tool("undo");
  }
  await section.getByRole("button", { name: "Fixed width", exact: true }).click();
  assert.ok((await node()).boxWidth > 0);
  await change("Text box width", 160);
  assert.equal((await node()).boxWidth, 160);
  assert.ok((await node()).height > original.height);
  await section.getByRole("button", { name: "Auto width", exact: true }).click();
  assert.equal((await node()).boxWidth, 0);
  assert.equal((await node()).text, original.text);
  mark("weight, italic, underline and text alignment retain their real operations; text-box auto/fixed width is reachable without advanced settings and actually wraps text");

  const advanced = section.getByRole("button", { name: "More text options", exact: true });
  await advanced.click();
  assert.equal(await advanced.getAttribute("aria-expanded"), "true");
  await change("Paragraph spacing", 12); assert.equal((await node()).paragraphSpacing, 12); await tool("undo");
  await change("Baseline shift", 3); assert.equal((await node()).baselineShift, 3); await tool("undo");
  await section.getByRole("button", { name: /^Vertical text/ }).click();
  assert.equal((await node()).direction, "vertical"); await tool("undo");
  await section.getByRole("button", { name: "Text case", exact: true }).click();
  await page.getByRole("option", { name: /^Uppercase$/i }).click();
  assert.equal((await node()).textCase, "upper"); await tool("undo");
  await page.evaluate(() => window.__vooEditor.updateNode("type-title", { textPath: { points: [{ x: 0, y: 100 }, { x: 300, y: 100 }], closed: false, startOffset: 0, align: "left" } }));
  await change("Start Offset", 24); assert.equal((await node()).textPath.startOffset, 24); await tool("undo");
  await page.evaluate(() => window.__vooEditor.updateNode("type-title", { textPath: null }));
  await advanced.click();
  assert.equal(await advanced.getAttribute("aria-expanded"), "false");
  mark("one advanced disclosure retains direction, letter case, paragraph spacing, baseline and path offset, with live changes and one-step undo");

  await section.getByRole("button", { name: /^Fonts:/ }).click();
  const fonts = page.getByRole("dialog", { name: "Fonts", exact: true });
  await fonts.getByRole("button", { name: /^System \(/ }).click();
  await fonts.getByRole("textbox", { name: "Search font...", exact: true }).fill("Arial");
  await fonts.getByText("Arial / Helvetica", { exact: true }).click();
  assert.match((await node()).fontFamily, /Arial/); await tool("undo");
  await page.evaluate(() => window.__vooEditor.selectExactly(["type-title", "type-body"])); await settle();
  const mixed = metric("Font size");
  assert.match(await mixed.getAttribute("placeholder"), /—/);
  await mixed.fill("48"); await mixed.press("Enter"); await settle();
  assert.equal((await node()).fontSize, 48); assert.equal((await node("type-body")).fontSize, 48);
  await tool("undo");
  assert.equal((await node()).fontSize, 32); assert.equal((await node("type-body")).fontSize, 20);
  mark("the existing font picker still applies a real family; mixed numeric text selection applies to both layers and one undo restores each original size");

  await page.evaluate(() => { window.__vooEditor.selectExactly([]); window.__vooEditor.setTool("text"); });
  const defaults = page.getByTestId("text-tool-typography");
  await defaults.waitFor();
  for (const [name, value] of [["Font size", "48"], ["Line height", "150"], ["Letter spacing", "1.5"]]) {
    const field = defaults.getByRole("spinbutton", { name: new RegExp(`^${name}`) });
    await field.fill(value); await field.press("Enter"); await settle();
  }
  await defaults.getByRole("button", { name: "Font weight", exact: true }).click();
  await page.getByRole("option", { name: "Bold", exact: true }).click();
  const point = await page.evaluate(() => {
    const box = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: box.left + 650 * box.width / doc.width, y: box.top + 450 * box.height / doc.height };
  });
  await page.mouse.click(point.x, point.y);
  const editor = page.locator("textarea:visible"); await editor.waitFor();
  await editor.fill("Created from typography controls"); await editor.press("Escape"); await settle();
  const created = await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(node => node.text === "Created from typography controls"));
  assert.ok(created); assert.equal(created.fontSize, 48); assert.equal(created.lineHeight, 1.5);
  assert.equal(created.letterSpacing, 1.5); assert.equal(String(created.fontWeight), "700");
  await page.evaluate(() => window.__vooEditor.setTool("select"));
  await tool("undo"); assert.equal(await node(created.id), null);
  await tool("redo"); assert.equal((await node(created.id)).text, created.text);
  mark("the shared text-tool controls change real creation defaults; actual pointer text creation uses size, weight and spacing and undoes/redoes once");

  await page.evaluate(() => window.__vooEditor.selectExactly(["type-title"]));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    for (const theme of ["dark", "light"]) {
      for (const locale of ["en", "zh"]) {
        await page.evaluate(async ({ theme, locale }) => {
          const { setEditorTheme } = await import("/src/canvas/use_editor_theme.js");
          const { setLocale } = await import("/src/shared/i18n.js");
          setEditorTheme(theme); await setLocale(locale);
        }, { theme, locale });
        // Compact-mode ResizeObserver publication precedes the real expand action.
        await settle();
        const toggle = panel.locator(".editor-mobile-panel-toggle");
        if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
        await settle();
        const caption = section.getByText(locale === "en" ? "Font size" : "字号", { exact: true });
        await caption.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(async error => {
          console.error(JSON.stringify({ width, theme, locale, state: await page.evaluate(() => {
            const root = document.querySelector('[data-testid="design-editor"]');
            const panel = document.querySelector('[data-testid="editor-properties-panel"]');
            const section = document.querySelector('[data-testid="text-typography-section"]');
            const ancestors = []; let current = section;
            while (current && current !== root) { const style = getComputedStyle(current); ancestors.push({tag:current.tagName,classes:current.className,display:style.display,height:current.getBoundingClientRect().height}); current = current.parentElement; }
            return { root: Object.fromEntries([...root.attributes].map(a => [a.name,a.value])), panelText: panel.innerText, toggles: [...panel.querySelectorAll('.editor-mobile-panel-toggle')].map(n=>n.outerHTML), ancestors };
          }) }));
          await page.screenshot({ path: `${evidence}/typography-failure.png` }); throw error;
        });
        const bounds = await panel.boundingBox();
        const box = await caption.boundingBox();
        assert.ok(box.width > 0 && box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width);
        assert.ok(await caption.evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 11));
        const sizes = await section.locator('input[type="number"]').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
        assert.ok(sizes.every(size => size.width >= 24 && size.height >= (width < 768 ? 48 : 32)), `${width}/${theme}/${locale} numeric fields need usable space`);
        await panel.screenshot({ path: `${evidence}/typography-${width}-${theme}-${locale}.png` });
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { setEditorTheme } = await import("/src/canvas/use_editor_theme.js");
    const { setLocale } = await import("/src/shared/i18n.js");
    setEditorTheme("dark"); await setLocale("en");
  });
  mark("typography captions, metric units and touch-sized controls remain usable at 320/390/768/1440 in Chinese/English and light/dark themes");
}
