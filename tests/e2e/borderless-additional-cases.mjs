/** Check secondary surfaces through their real entry points without generation. */
export async function checkAdditionalBorderSurfaces(page, audit) {
  const labels = await page.evaluate(async () => {
    const { t } = await import("/src/shared/i18n.js");
    return Object.fromEntries(
      [
        "addAttachment",
        "styleLabel",
        "designSystem",
        "sizeLabel",
        "candidates",
      ].map((key) => [key, t(`welcome.prompt.${key}`)]),
    );
  });
  const composer = page.locator("form.prompt-composer");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const field of ["styleLabel", "designSystem", "sizeLabel"]) {
      await composer
        .getByRole("button", { name: labels.addAttachment, exact: true })
        .click();
      await audit(`welcome-context-${width}-${field}`);
      await composer
        .getByRole("button", { name: labels[field], exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await audit(`welcome-dialog-${width}-${field}`);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
    }
    await composer
      .getByRole("button", { name: labels.candidates, exact: true })
      .click();
    const candidates = composer.getByRole("menu", {
      name: labels.candidates,
      exact: true,
    });
    await candidates.waitFor();
    await audit(`welcome-candidates-${width}`);
    await composer
      .getByRole("button", { name: labels.candidates, exact: true })
      .click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("design-editor").waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-open-guard]")
        ?.getAttribute("data-open-guard") === "off",
  );
  await page
    .getByTestId("editor-top-bar")
    .getByRole("button", { name: "Export", exact: true })
    .click();
  const exportDialog = page.getByTestId("design-export-dialog");
  await exportDialog.waitFor();
  await audit("design-export-dialog");
  await page.keyboard.press("Escape");
  await exportDialog.waitFor({ state: "detached" });
  // Fixture content isolates drawer chrome from external site decoration.
  await page.route("https://example.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<p>Browser preview fixture</p>",
    }),
  );
  const browserTrigger = page.getByTestId("titlebar-browser-button");
  await browserTrigger.click();
  const drawer = page.locator(".voo-browser-drawer");
  await drawer.waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await audit(`browser-drawer-${width}`);
    const tools = drawer.getByRole("button", {
      name: "Browser tools",
      exact: true,
    });
    await tools.click();
    const menu = drawer.getByRole("menu", {
      name: "Browser tools",
      exact: true,
    });
    await menu.waitFor();
    await audit(`browser-tools-${width}`);
    const htmlLabel = await page.evaluate(async () => {
      const { t } = await import("/src/shared/i18n.js");
      return t("browser.customHtml");
    });
    await menu.getByRole("menuitem", { name: htmlLabel, exact: true }).click();
    await drawer.getByRole("textbox").last().waitFor();
    await audit(`browser-custom-html-${width}`);
    await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await drawer
    .getByRole("button", { name: "Close Browser", exact: true })
    .click();
  await drawer.waitFor({ state: "detached" });
}
