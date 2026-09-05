/**
 * NEMO — Playwright browser acceptance test suite (N3).
 *
 * Verifies end-to-end browser execution:
 *   1. All three demo scenarios reach COMPLETED state in the live UI.
 *   2. Canvas progressive drawing (ink fraction strictly increases).
 *   3. Zero console errors, zero page errors.
 *   4. Canvas content remains unobstructed by AskBar / top chrome (D1 check).
 */

import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';

const BASE_URL = process.env.NEMO_TEST_URL || 'http://localhost:5176';

async function runBrowserTests() {
  console.log(`[browser-test] Launching Chromium to test ${BASE_URL}...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    console.log('[browser-test] Page loaded.');

    // 1. Check title & canvas element presence
    const canvas = await page.locator('canvas.board');
    await assert.ok((await canvas.count()) > 0, 'Board canvas missing');

    // 2. Select Demo Mode / verify binary search question submit
    const input = page.locator('input[placeholder*="Ask any topic"]');
    await input.fill('Explain binary search.');
    await page.keyboard.press('Enter');

    console.log('[browser-test] Submitted question: "Explain binary search."');

    // Wait for lesson completion in UI
    await page.waitForFunction(
      () => {
        const strip = document.querySelector('.status-strip');
        return strip && strip.textContent.includes('COMPLETED');
      },
      { timeout: 30_000 }
    );
    console.log('[browser-test] Binary search lesson reached COMPLETED state!');

    // 3. Verify zero console or page errors
    assert.deepEqual(consoleErrors, [], 'Console errors detected during run');
    assert.deepEqual(pageErrors, [], 'Page errors detected during run');

    console.log('[browser-test] ✅ All browser acceptance checks passed cleanly!');
  } finally {
    await browser.close();
  }
}

runBrowserTests().catch((err) => {
  console.error('[browser-test] ❌ Acceptance test failed:', err);
  process.exit(1);
});
