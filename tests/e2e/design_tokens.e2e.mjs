// Run under flock /tmp/voo-e2e.lock. Requires Vite at VOO_TEST_URL.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const shotDir = process.env.VOO_SHOT_DIR || '/tmp/shots-ds-tokens';
await mkdir(shotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(process.env.VOO_TEST_URL || 'http://localhost:5197/?voo-test=1');
  await page.getByTitle(/返回画布|Back to canvas/).click();
  await page.waitForFunction(() => Boolean(window.__vooEditor), null, { timeout: 60000 });
  // Use the existing Settings entry point.
  await page.getByTitle(/^(Settings|Preferences|设置|偏好)/).first().click();
  await page.getByRole('tab', { name: /Design System|设计系统/ }).click();
  await page.getByLabel('Color roles', { exact: true }).fill('{"accent":"#7c3aed","background":"#faf9f6","text":"#202020"}');
  await page.getByRole('button', { name: 'Save design system', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved to this page' }).waitFor();
  await page.locator('[data-testid="settings-drawer"] main').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: `${shotDir}/tokens.png` });
  await page.getByLabel('designMd', { exact: true }).fill('# Editorial system\n\nCalm surfaces, generous spacing, and clear type hierarchy.\n\n## Components\nUse the accent role for primary actions.');
  await page.getByRole('button', { name: 'Save design system', exact: true }).click();
  await page.getByLabel('designMd', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotDir}/design-md.png` });
  await page.getByLabel('Spacing scale · px', { exact: true }).fill('[-1]');
  await page.getByRole('button', { name: 'Save design system', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'non-negative' }).waitFor();
  const stored = await page.evaluate(() => window.__vooEditor.serialise());
  assert.equal(stored.designTokens.colors.accent, '#7c3aed');
  assert.ok(stored.designMd.includes('Editorial system'));
  assert.ok(stored.designTokens.spacing.every(value => value >= 0));
  // Reopen the tab to check that persisted values replace invalid drafts.
  await page.getByRole('tab', { name: /Shortcuts|快捷键速查/ }).click();
  await page.getByRole('tab', { name: /Design System|设计系统/ }).click();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="designMd"]')?.value.includes('Editorial system'));
  assert.ok((await page.getByLabel('designMd', { exact: true }).inputValue()).includes('Editorial system'));
  assert.ok(!(await page.getByLabel('Spacing scale · px', { exact: true }).inputValue()).includes('-1'));
  console.log(`Design system browser checks passed; screenshots: ${shotDir}/tokens.png, ${shotDir}/design-md.png`);
} finally { await browser.close(); }
