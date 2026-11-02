// Run with Vite on 127.0.0.1:5173. Artifacts stay outside the repository.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("/workspace/tmp", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  for (const locale of ["en", "zh"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.goto("http://127.0.0.1:5173/?firstRun=1", { waitUntil: "domcontentloaded" });
    const modal = page.getByTestId("first-run-onboarding");
    await modal.waitFor();
    await modal.getByRole("button", { name: locale === "en" ? "English" : "中文", exact: true }).click();
    await modal.getByRole("heading", { name: locale === "en" ? "Welcome to VOO Design" : "欢迎使用 VOO Design", exact: true }).waitFor();
    for (const step of ["welcome", "start", "tour", "provider"]) {
      await page.locator(`[data-testid="first-run-onboarding"][data-step="${step}"]`).waitFor();
      await page.screenshot({ path: `/workspace/tmp/onboard-after-${locale}-${step}.png` });
      if (step !== "provider") await modal.getByTestId("first-run-next").click();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
