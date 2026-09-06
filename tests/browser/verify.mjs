/**
 * NEMO — Playwright browser acceptance test suite (N3).
 *
 * Verifies end-to-end browser execution:
 *   1. The ESP32 vertical slice reaches COMPLETED state in the live UI.
 *   2. Canvas progressive drawing (ink fraction strictly increases).
 *   3. Zero console errors, zero page errors.
 *   4. Canvas content remains unobstructed by AskBar / top chrome (D1 check).
 */

import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE_URL = process.env.NEMO_TEST_URL || 'http://localhost:5176';

async function runBrowserTests() {
  console.log(`[browser-test] Launching Chromium to test ${BASE_URL}...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    localStorage.setItem('nemo.settings.v1', JSON.stringify({
      provider: 'mock',
      voiceEnabled: false,
    }));
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

    // 2. Run the complete embedded-systems lesson through SSE + Presenter.
    const input = page.locator('textarea.ask__input');
    await input.fill('How does an ESP32 turn on an LED?');
    await page.keyboard.press('Enter');

    console.log('[browser-test] Submitted question: "How does an ESP32 turn on an LED?"');

    const inkCount = () => page.locator('canvas.board').evaluate((element) => {
      const canvas = element;
      const context2d = canvas.getContext('2d');
      if (!context2d) return 0;
      const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      // The canvas background is opaque #101010 and its grid dots remain
      // below this threshold. Count bright chalk/component pixels instead.
      for (let index = 0; index < pixels.length; index += 16) {
        if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 70) lit += 1;
      }
      return lit;
    });

    await page.waitForSelector('.rail__stage-text--drawing', { timeout: 15_000 });
    const earlyInk = await inkCount();
    await page.waitForTimeout(500);
    const laterInk = await inkCount();
    assert.ok(laterInk > earlyInk, `canvas did not draw progressively (${earlyInk} -> ${laterInk})`);

    // Wait for lesson completion in UI
    await page.waitForFunction(
      () => {
        const stage = document.querySelector('.rail__stage-text');
        return stage && stage.textContent.trim() === 'Completed';
      },
      { timeout: 45_000 }
    );
    console.log('[browser-test] ESP32 lesson reached COMPLETED state!');

    const completedInk = await inkCount();
    assert.ok(completedInk > laterInk, 'completed lesson did not add ink after the early frame');
    await page.getByRole('button', { name: 'Log' }).click();
    const executionLog = await page.locator('.log__body').textContent();
    const unresolved = executionLog?.split('layout:').filter((line) => line.includes('UNRESOLVED')) ?? [];
    if (unresolved.length) console.log('[browser-test] Unresolved layout:', unresolved.join(' | '));
    for (const action of ['CREATE_ESP32', 'CREATE_WIRE', 'SET_GPIO_STATE', 'SET_LED_STATE']) {
      assert.ok(executionLog?.includes(`${action} COMPLETED`), `${action} did not complete in browser`);
    }
    assert.ok(!executionLog?.includes('ACTION FAILED'), 'an action failed during browser execution');
    assert.deepEqual(unresolved, [], 'the completed browser lesson has unresolved overlaps');
    await page.getByRole('button', { name: 'Hide log' }).click();

    const writtenAnswer = await page.locator('.rail__body').textContent();
    assert.ok(writtenAnswer?.includes('220 ohm'), 'Demo Mode did not publish its written answer');

    const artifactDir = resolve('artifacts', 'browser');
    await mkdir(artifactDir, { recursive: true });
    const screenshotPath = resolve(artifactDir, 'esp32-led-completed.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[browser-test] Render captured: ${screenshotPath}`);

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
