// ============================================================
// capture-promo.mjs — Cosmic Golf promo video capture
// Three.js game — uses pointer events to simulate slingshot aim + shoot.
// Records at 0.5x wall-clock speed → 50 FPS after ffmpeg speedup.
// ============================================================

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT              = getArg('port', '3001');
const GAME_URL          = `http://localhost:${PORT}/`;
const VIEWPORT          = { width: 1080, height: 1920 };
// Record 30s of wall-clock → 15s of actual game time at 50 FPS
const WALL_CLOCK_MS     = 30000;
const OUTPUT_DIR        = path.resolve(PROJECT_DIR, getArg('output-dir', 'output'));
const OUTPUT_FILE       = path.join(OUTPUT_DIR, 'promo-raw.webm');

// ── Helpers ────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Simulate a drag: pointerdown at (x,y), move to (x+dx, y+dy), pointerup.
 * Used for both aim (phase 1) and power (phase 2).
 */
async function drag(page, x, y, dx, dy, durationMs) {
  const steps = Math.max(4, Math.round(durationMs / 16));
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + dx * (i / steps), y + dy * (i / steps));
    await sleep(durationMs / steps);
  }
  await page.mouse.up();
}

/**
 * Fire a shot:
 *  1. Phase 1 — drag from ball screen pos in aim direction (sets _facingDir)
 *  2. Short pause (direction locked)
 *  3. Phase 2 — drag upward to set power, release to fire
 */
async function fireShot(page, ballX, ballY, aimDX, aimDY, powerDragPx) {
  // Phase 1: aim direction — drag ~60px from ball in desired direction
  const aimDist = 60;
  const len = Math.sqrt(aimDX * aimDX + aimDY * aimDY) || 1;
  const nx  = aimDX / len;
  const ny  = aimDY / len;
  await drag(page, ballX, ballY, nx * aimDist, ny * aimDist, 400);
  await sleep(300); // direction locked, power phase begins

  // Phase 2: new touch, drag upward for power
  const powerX = VIEWPORT.width / 2;
  const powerY = VIEWPORT.height * 0.7;
  await drag(page, powerX, powerY, 0, -powerDragPx, 600);
  await sleep(400); // let ball fly
}

// ── Main capture ───────────────────────────────────────────

async function captureGameplay() {
  console.log('🎬 Cosmic Golf promo capture');
  console.log(`  URL: ${GAME_URL} | Viewport: ${VIEWPORT.width}×${VIEWPORT.height}`);
  console.log(`  Wall clock: ${WALL_CLOCK_MS}ms → ~${WALL_CLOCK_MS / 2}ms game time`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-gpu', '--ignore-gpu-blocklist'],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: OUTPUT_DIR, size: VIEWPORT },
    // Disable Partykit WebSocket noise
    extraHTTPHeaders: {},
  });

  const page = await context.newPage();

  // Suppress console noise
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [page error] ${msg.text()}`);
  });

  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for canvas to appear (Three.js game)
  await page.waitForSelector('canvas', { timeout: 15000 });
  console.log('  Canvas visible.');

  // Let hole fully load (planets, ball placed) — generous wait
  await sleep(4000);
  console.log('  Game loaded.');

  // Ball starts roughly centred — estimate screen position
  // Camera starts at tee. Ball is near screen centre-bottom area.
  const CX = VIEWPORT.width  / 2;
  const CY = VIEWPORT.height / 2 + 200;

  // ── Shot sequence ─────────────────────────────────────────
  // Fire several shots at interesting angles, letting gravity do the work.
  // Aim toward upper-right first (toward cup area), vary angles each shot.

  const shots = [
    // [aimDX, aimDY (screen), powerPx]  — negative Y = upward on screen
    { dx:  40, dy: -80, power: 90 },   // upper right — slingshot toward planets
    { dx: -20, dy: -90, power: 110 },  // slightly left — orbit
    { dx:  60, dy: -60, power: 80 },   // 45° upper right
    { dx:   0, dy: -100, power: 100 }, // straight up
    { dx:  80, dy: -40, power: 95 },   // right
    { dx: -50, dy: -70, power: 105 },  // upper left
    { dx:  30, dy: -90, power: 115 },  // upper right strong
  ];

  let elapsed = 0;
  let shotIdx = 0;
  const startTime = Date.now();

  while (elapsed < WALL_CLOCK_MS) {
    const shot = shots[shotIdx % shots.length];
    console.log(`  Shot ${shotIdx + 1}: dx=${shot.dx} dy=${shot.dy} power=${shot.power}px`);

    try {
      await fireShot(page, CX, CY, shot.dx, shot.dy, shot.power);
    } catch (e) {
      console.log(`  Shot failed (probably hole complete overlay): ${e.message.slice(0, 60)}`);
    }

    // Watch ball for 3–5s per shot
    const flightTime = 3000 + Math.random() * 2000;
    await sleep(flightTime);

    // Dismiss scoreboard if visible (click the "CONTINUE" button if present)
    try {
      const btn = page.locator('#btn-next-hole');
      const visible = await btn.isVisible({ timeout: 500 });
      if (visible) {
        console.log('  Scoreboard visible — clicking continue.');
        await btn.click();
        await sleep(2000); // next hole loads
      }
    } catch (_) {}

    elapsed = Date.now() - startTime;
    shotIdx++;
  }

  console.log('  Sequence complete, finalising video...');

  const video = page.video();
  await context.close();
  const videoPath = await video.path();

  if (videoPath !== OUTPUT_FILE) {
    fs.renameSync(videoPath, OUTPUT_FILE);
  }

  await browser.close();
  console.log(`  Raw recording: ${OUTPUT_FILE}`);

  const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);
  console.log(`  File size: ${sizeMB} MB`);
  console.log('✅ Capture done.');
}

captureGameplay().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
