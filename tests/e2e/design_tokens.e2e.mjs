// Run under flock /tmp/voo-e2e.lock. Requires Vite at VOO_TEST_URL.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const shotDir = process.env.VOO_SHOT_DIR || '/workspace/tmp/shots-ds-tokens-ui';
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
  await page.getByLabel('colors accent', { exact: true }).fill('#7c3aed');
  await page.getByLabel('colors background picker', { exact: true }).fill('#faf9f6');
  await page.getByLabel('typeScale 0', { exact: true }).fill('13');
  await page.getByLabel('radius small', { exact: true }).fill('5');
  await page.getByLabel('components button paddingX', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Save design system', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved to this page' }).waitFor();
  await page.locator('[data-testid="settings-drawer"] main').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: `${shotDir}/tokens.png` });
  await page.getByLabel('designMd', { exact: true }).fill('# Editorial system\n\nCalm surfaces, generous spacing, and clear type hierarchy.\n\n## Components\nUse the accent role for primary actions.');
  await page.getByRole('button', { name: 'Save design system', exact: true }).click();
  await page.getByLabel('designMd', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotDir}/design-md.png` });
  await page.getByLabel('spacing 0', { exact: true }).fill('-1');
  await page.getByRole('button', { name: 'Save design system', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'non-negative' }).waitFor();
  const stored = await page.evaluate(() => window.__vooEditor.serialise());
  assert.equal(stored.designTokens.colors.accent, '#7c3aed');
  assert.equal(stored.designTokens.colors.background, '#faf9f6');
  assert.equal(stored.designTokens.typeScale[0], 13);
  assert.equal(stored.designTokens.radius.small, 5);
  assert.equal(stored.designTokens.components.button.paddingX, 20);
  assert.ok(stored.designMd.includes('Editorial system'));
  assert.ok(stored.designTokens.spacing.every(value => value >= 0));
  // Reopen the tab to check that persisted values replace invalid drafts.
  await page.getByRole('tab', { name: /Shortcuts|快捷键速查/ }).click();
  await page.getByRole('tab', { name: /Design System|设计系统/ }).click();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="designMd"]')?.value.includes('Editorial system'));
  assert.ok((await page.getByLabel('designMd', { exact: true }).inputValue()).includes('Editorial system'));
  assert.ok(!(await page.getByLabel('spacing 0', { exact: true }).inputValue()).includes('-1'));
  await page.getByLabel('spacing 0', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save design system', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'non-negative' }).waitFor();
  console.log(`Design system browser checks passed; screenshots: ${shotDir}/tokens.png, ${shotDir}/design-md.png`);
} finally { await browser.close(); }
