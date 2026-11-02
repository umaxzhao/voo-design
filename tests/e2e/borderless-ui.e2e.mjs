import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { scanUiBorders } from "./ui-border-scanner.mjs";
import { checkAdditionalBorderSurfaces } from "./borderless-additional-cases.mjs";

const evidence =
  process.env.VOO_BORDERLESS_EVIDENCE ?? "/private/tmp/voo-borderless-ui";
await mkdir(evidence, { recursive: true });
await withEditorBrowser(async ({ page, tool, errors }) => {
  const checks = [];
  try {
    const audit = async (name) => {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const findings = await scanUiBorders(page);
      assert.equal(
        await page
          .locator(".app-root-frame")
          .evaluate((el) => getComputedStyle(el).backgroundImage),
        "none",
        "Outer spacing must not reveal a decorative gradient perimeter",
      );
      await writeFile(
        `${evidence}/${name}.json`,
        JSON.stringify(findings, null, 2),
      );
      if (findings.length)
        await page.screenshot({ path: `${evidence}/${name}.png` });
      assert.deepEqual(
        findings,
        [],
        `${name}: interface surfaces must not paint decorative borders or rings`,
      );
      checks.push(name);
    };
    let blockedRequests = 0;
    await page.route("**/*", async (route) => {
      if (
        route.request().method() === "POST" &&
        /generate|completions|images|auth\/(login|register)/i.test(
          route.request().url(),
        )
      ) {
        blockedRequests++;
        await route.fulfill({
          status: 503,
          body: "UI audit forbids generation and authentication requests",
        });
      } else await route.continue();
    });
    await page.evaluate(async () => {
      const { createRectNode, createTextNode, createGroupNode } =
        await import("/src/canvas/editor/scene_model.js");
      const e = window.__vooEditor;
      e.setDoc({
        ...e.getDocument(),
        isCanvasRoot: true,
        nodes: [
          {
            ...createGroupNode({ x: 20, y: 20, width: 700, height: 500 }),
            id: "border-frame",
            name: "Frame",
            isFrame: true,
            fill: "#ffffff",
          },
          {
            ...createRectNode({
              x: 70,
              y: 70,
              width: 140,
              height: 100,
              fill: "#ff0000",
              stroke: "#0000ff",
              strokeWidth: 6,
            }),
            id: "border-rect",
            parentId: "border-frame",
          },
          {
            ...createTextNode({
              x: 250,
              y: 100,
              text: "Borderless interface",
              fontSize: 24,
            }),
            id: "border-text",
            parentId: "border-frame",
          },
        ],
      });
      e.selectExactly(["border-rect"]);
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 80;
      canvas.getContext("2d").fillRect(0, 0, 100, 80);
      const image = await e.insertImage(canvas.toDataURL(), { x: 400, y: 120 });
      window.__borderImage = image.id;
      e.updateNode(image.id, { parentId: "border-frame" });
      e.selectExactly(["border-rect"]);
    });
    const panel = page.getByTestId("editor-properties-panel");
    const select = async (ids) => {
      await page.evaluate((ids) => {
        const e = window.__vooEditor;
        e.setTool("select");
        e.selectExactly(
          ids.map((id) => (id === "image" ? window.__borderImage : id)),
        );
      }, ids);
      // Selection publishes before React swaps the object/background header.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    };
    const configure = async (width, theme, locale) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.evaluate(
        async ({ theme, locale }) => {
          const { setEditorTheme } =
            await import("/src/canvas/use_editor_theme.js");
          const { setLocale } = await import("/src/shared/i18n.js");
          setEditorTheme(theme);
          await setLocale(locale);
        },
        { theme, locale },
      );
    };
    const selections = [
      ["shape", ["border-rect"]],
      ["Frame", ["border-frame"]],
      ["text", ["border-text"]],
      ["image", ["image"]],
      ["multiple", ["border-rect", "border-text"]],
      ["background", []],
    ];
    for (const width of [1440, 768, 390, 320])
      for (const theme of ["dark", "light"])
        for (const locale of ["en", "zh"]) {
          await configure(width, theme, locale);
          for (const [kind, ids] of selections) {
            await select(ids);
            const toggle = panel.locator(".editor-mobile-panel-toggle");
            if (
              (await toggle.isVisible()) &&
              (await toggle.getAttribute("aria-expanded")) === "false"
            )
              await toggle.click();
            await audit(`${width}-${theme}-${locale}-${kind}`);
            if (
              (width === 1440 && theme === "dark" && locale === "en") ||
              (width === 390 && theme === "light" && locale === "zh")
            ) {
              await page.screenshot({
                path: `${evidence}/${width}-${theme}-${kind}.png`,
              });
            }
          }
        }
    await configure(1440, "dark", "en");
    await select(["image"]);
    for (const mode of [
      "rect",
      "ellipse",
      "text",
      "pen",
      "marquee",
      "wand",
      "brush",
      "eraser",
      "healing",
      "blur",
      "dodge",
      "crop",
      "fill",
      "gradient",
      "dropper",
    ]) {
      await page.evaluate((mode) => window.__vooEditor.setTool(mode), mode);
      if (mode === "brush") {
        const foreground = panel.getByRole("button", {
          name: "Foreground Color",
          exact: true,
        });
        const background = panel.getByRole("button", {
          name: "Background Color",
          exact: true,
        });
        await background.click();
        assert.equal(await background.getAttribute("aria-pressed"), "true");
        assert.equal(await foreground.getAttribute("aria-pressed"), "false");
        assert.deepEqual(
          await scanUiBorders(page),
          [],
          "Paint-slot selection must not add a decorative ring",
        );
        await foreground.click();
        assert.equal(await foreground.getAttribute("aria-pressed"), "true");
        await panel.screenshot({ path: `${evidence}/paint-slots.png` });
      }
      await audit(`tool-${mode}`);
    }
    await select(["border-rect"]);
    const xField = panel.getByRole("textbox", { name: "X", exact: true });
    const fieldSurface = xField.locator("..");
    const idleFill = await fieldSurface.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await xField.focus();
    await xField.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await fieldSurface.evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
    );
    assert.notEqual(
      await fieldSurface.evaluate((el) => getComputedStyle(el).backgroundColor),
      idleFill,
      "Numeric keyboard focus stays visible through a filled state",
    );
    await audit("numeric-focus");
    const original = await page.evaluate(() =>
      window.__vooEditor.getNode("border-rect"),
    );
    const blend = panel.getByRole("button", {
      name: "Blend mode",
      exact: true,
    });
    await blend.click();
    await audit("blend-menu");
    await page.getByRole("option", { name: "Multiply", exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => window.__vooEditor.getNode("border-rect").blendMode,
      ),
      "multiply",
    );
    await tool("undo");
    assert.equal(
      await page.evaluate(
        () => window.__vooEditor.getNode("border-rect").blendMode,
      ),
      original.blendMode,
    );
    await panel.getByRole("button", { name: "Fill", exact: true }).click();
    const fill = page.getByRole("dialog", { name: "Fill", exact: true });
    await fill.waitFor();
    await audit("fill-solid");
    await fill.getByRole("tab", { name: "Gradient", exact: true }).click();
    await audit("fill-gradient");
    assert.ok(
      (await fill.locator('[data-ui-guide="color-handle"]').count()) > 0,
      "Real gradient handles retain their visual geometry",
    );
    assert.match(
      await page.evaluate(() => window.__vooEditor.getNode("border-rect").fill),
      /^linear-gradient/,
    );
    await fill.getByRole("button", { name: "Mesh", exact: true }).click();
    await audit("fill-mesh");
    await page.keyboard.press("Escape");
    await tool("undo");
    await tool("undo");
    assert.equal(
      await page.evaluate(() => window.__vooEditor.getNode("border-rect").fill),
      original.fill,
    );
    await panel
      .getByRole("button", { name: "Add effect", exact: true })
      .click();
    await page.getByTestId("editor-adjustment-picker").waitFor();
    await audit("effect-picker");
    await page.keyboard.press("Escape");
    await select(["border-text"]);
    await panel.getByRole("button", { name: /^Fonts:/ }).click();
    await page.getByRole("dialog").waitFor();
    await audit("font-picker");
    await page.keyboard.press("Escape");
    await select(["border-frame"]);
    await panel
      .getByRole("button", { name: "Horizontal", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Auto layout settings", exact: true })
      .click();
    await page.getByTestId("editor-auto-layout-advanced").waitFor();
    await audit("auto-layout-advanced");
    await page.keyboard.press("Escape");
    await tool("undo");
    // The artwork stroke is document content, not an interface decoration.
    assert.equal(
      await page.evaluate(
        () => window.__vooEditor.getNode("border-rect").stroke,
      ),
      "#0000ff",
    );
    assert.equal(
      await page.evaluate(
        () => window.__vooEditor.getNode("border-rect").strokeWidth,
      ),
      6,
    );
    assert.equal(
      await page.evaluate(() =>
        window.__vooEditor.sampleColorAt({ x: 70, y: 90 }),
      ),
      "#0000ff",
      "Artwork strokes must remain visible as actual pixels",
    );
    await page
      .getByTestId("editor-top-bar")
      .getByRole("button", { name: "VOO Design", exact: true })
      .click();
    await page.locator(".welcome-dashboard").waitFor();
    for (const width of [1440, 390])
      for (const theme of ["dark", "light"]) {
        await configure(width, theme, "en");
        await audit(`welcome-${width}-${theme}`);
        const form = page.locator("form.prompt-composer");
        const rim = await form.evaluate((el) => ({
          before: getComputedStyle(el, "::before").backgroundImage,
          border: getComputedStyle(el).borderTopWidth,
        }));
        assert.deepEqual(rim, { before: "none", border: "0px" });
      }
    await configure(1440, "dark", "en");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const drawer = page.getByTestId("settings-drawer");
    await drawer.waitFor();
    const tabs = drawer.getByRole("navigation").getByRole("tab");
    for (let index = 0; index < (await tabs.count()); index++) {
      await tabs.nth(index).click();
      await audit(`settings-${index}`);
    }
    await page.keyboard.press("Escape");
    await checkAdditionalBorderSurfaces(page, audit);
    assert.deepEqual(errors, [], "Borderless surfaces must not introduce page errors");
    assert.equal(
      blockedRequests,
      0,
      "Visual checks must not initiate paid generation or authentication",
    );
    await writeFile(
      `${evidence}/result.json`,
      JSON.stringify({ checks }, null, 2),
    );
    console.log(JSON.stringify({ checks, evidence }, null, 2));
  } catch (error) {
    await page.screenshot({ path: `${evidence}/failure.png` });
    await writeFile(
      `${evidence}/failure.json`,
      JSON.stringify({ checks, errors, message: String(error) }, null, 2),
    );
    throw error;
  }
});
