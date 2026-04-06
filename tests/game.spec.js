import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Ensure output directory exists before screenshot tests
const outputDir = path.resolve('./output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

test('Test 1: Game loads — canvas exists, no critical JS errors, correct title', async ({ page }) => {
  const jsErrors = [];
  page.on('pageerror', (err) => {
    jsErrors.push(err.message);
  });

  await page.goto('/');
  await page.waitForTimeout(3000);

  // Verify canvas element exists
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // Verify page title contains "Cosmic Golf" or "cosmic"
  const title = await page.title();
  expect(title.toLowerCase()).toMatch(/cosmic/i);

  // Verify no critical JS errors (filter out warnings/non-errors)
  const criticalErrors = jsErrors.filter(msg =>
    !msg.includes('Warning') &&
    !msg.includes('warn') &&
    !msg.includes('WebGL') &&
    !msg.includes('THREE.WebGLRenderer')
  );
  expect(criticalErrors, `Critical JS errors: ${criticalErrors.join(', ')}`).toHaveLength(0);
});

test('Test 2: VibeJam widget present in HTML source', async ({ page }) => {
  const response = await page.goto('/');
  const html = await response.text();

  expect(html).toContain('jam.pieter.com/2026/widget.js');
});

test('Test 3: UI elements visible + screenshot', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);

  // Check that some known UI text is visible — HUD hole counter or aim hint
  const hudHole = page.locator('#hud-hole');
  const aimHint = page.locator('#aim-hint');
  const roomCodeUi = page.locator('#room-code-ui');

  // At least one of these should be visible
  const hudHoleVisible = await hudHole.isVisible().catch(() => false);
  const aimHintVisible = await aimHint.isVisible().catch(() => false);
  const roomCodeVisible = await roomCodeUi.isVisible().catch(() => false);

  expect(
    hudHoleVisible || aimHintVisible || roomCodeVisible,
    'Expected at least one UI element (hole counter, aim hint, or room code) to be visible'
  ).toBe(true);

  // Take screenshot
  await page.screenshot({ path: 'output/test-screenshot.png', fullPage: false });
});

test('Test 4: Portal URL params accepted — no crash', async ({ page }) => {
  const jsErrors = [];
  page.on('pageerror', (err) => {
    jsErrors.push(err.message);
  });

  await page.goto('/?portal=true&username=TestPlayer&color=ff0000');
  await page.waitForTimeout(2000);

  // Canvas should still be present — page did not crash
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // No critical JS errors from portal params
  const criticalErrors = jsErrors.filter(msg =>
    !msg.includes('Warning') &&
    !msg.includes('warn') &&
    !msg.includes('WebGL') &&
    !msg.includes('THREE.WebGLRenderer')
  );
  expect(criticalErrors, `Critical JS errors with portal params: ${criticalErrors.join(', ')}`).toHaveLength(0);
});

test('Test 5: Performance baseline — canvas renders', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(3000);

  // Verify canvas exists and is rendered (has non-zero dimensions)
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    return {
      exists: true,
      width: c.width,
      height: c.height,
      tagName: c.tagName,
    };
  });

  expect(canvas).not.toBeNull();
  expect(canvas.exists).toBe(true);
  expect(canvas.width).toBeGreaterThan(0);
  expect(canvas.height).toBeGreaterThan(0);
});
