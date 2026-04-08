// ============================================================
// LaunchWarp.js — ripping-through-the-void effect on ball launch
// Scales with shot power (0..1):
//   • FOV kick: camera widens then snaps back
//   • Speed lines: CSS canvas overlay radial streaks from ball screen pos
//   • Vignette flash: screen edges darken briefly
// ============================================================

import { Vector3 } from 'three';
import { CAMERA } from '../core/Constants.js';

const _ndc = new Vector3();

function worldToScreen(worldPos, camera, w, h) {
  _ndc.copy(worldPos).project(camera);
  return {
    x: ( _ndc.x * 0.5 + 0.5) * w,
    y: (-_ndc.y * 0.5 + 0.5) * h,
  };
}

export class LaunchWarp {
  constructor(camera) {
    this.camera    = camera;
    this._active   = false;
    this._elapsed  = 0;
    this._duration = 0;
    this._fovKick  = 0;
    this._ballPos  = new Vector3(); // world pos at trigger time

    this._buildOverlay();
  }

  // ── DOM overlay ───────────────────────────────────────────

  _buildOverlay() {
    this._canvas = document.createElement('canvas');
    const s = this._canvas.style;
    s.position      = 'fixed';
    s.inset         = '0';
    s.width         = '100%';
    s.height        = '100%';
    s.pointerEvents = 'none';
    s.zIndex        = '50';
    s.opacity       = '0';
    document.body.appendChild(this._canvas);

    this._ctx = this._canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this._canvas.width  = window.innerWidth;
    this._canvas.height = window.innerHeight;
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * @param {number} power      normalised 0..1
   * @param {Vector3} ballPos   world position of ball at launch
   */
  trigger(power) {
    const p = Math.max(0, Math.min(1, power));
    this._active   = true;
    this._elapsed  = 0;
    this._power    = p;
    this._duration = 1.1 + p * 0.7;   // 1.1 – 1.8 s
    this._fovKick  = 8 + p * 20;       // 8 – 28° extra FOV
  }

  /**
   * @param {number}  dt
   * @param {Vector3} ballPos  current world position of ball — tracked each frame
   */
  update(dt, ballPos) {
    if (!this._active) return;

    this._elapsed += dt;
    const t = Math.min(this._elapsed / this._duration, 1);

    // Track ball position every frame so lines follow it
    if (ballPos) this._ballPos.copy(ballPos);

    // Fast attack (8%) then slow decay
    const env = t < 0.08
      ? t / 0.08
      : 1 - ((t - 0.08) / 0.92);

    // ── FOV kick ──
    this.camera.fov = CAMERA.FOV + this._fovKick * env;
    this.camera.updateProjectionMatrix();

    // ── Overlay alpha ──
    this._canvas.style.opacity = String(env * (0.35 + this._power * 0.45));

    this._drawFrame(env);

    if (t >= 1) {
      this._active = false;
      this.camera.fov = CAMERA.FOV;
      this.camera.updateProjectionMatrix();
      this._canvas.style.opacity = '0';
    }
  }

  _drawFrame(env) {
    const w   = this._canvas.width;
    const h   = this._canvas.height;
    const ctx = this._ctx;

    // Project ball to screen — fallback to screen center if offscreen
    const sp  = worldToScreen(this._ballPos, this.camera, w, h);
    const cx  = (sp.x > 0 && sp.x < w) ? sp.x : w / 2;
    const cy  = (sp.y > 0 && sp.y < h) ? sp.y : h / 2;

    // Max radius: farthest screen corner from ball position
    const cornerDist = Math.max(
      Math.hypot(cx,     cy),
      Math.hypot(w - cx, cy),
      Math.hypot(cx,     h - cy),
      Math.hypot(w - cx, h - cy),
    );

    ctx.clearRect(0, 0, w, h);

    // ── Speed lines ──────────────────────────────────────────
    const lineCount = Math.floor(60 + this._power * 80);
    const maxLen    = cornerDist * (0.55 + this._power * 0.4) * env;

    ctx.save();
    ctx.strokeStyle = `rgba(200, 220, 255, ${0.6 * env})`;
    ctx.lineWidth   = 0.8 + this._power * 0.8;

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2;
      // Lines start very close to ball (2–6px) and streak outward
      const inner = 2 + Math.random() * 4;
      const outer = maxLen * (0.3 + Math.random() * 0.7);

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();

    // ── Vignette — radiates from ball position ────────────────
    const vigRad = cornerDist;
    const vig = ctx.createRadialGradient(cx, cy, 0, cx, cy, vigRad);
    vig.addColorStop(0,    'rgba(0,0,0,0)');
    vig.addColorStop(0.45, 'rgba(0,0,0,0)');
    vig.addColorStop(1,    `rgba(0,0,20,${0.7 * env * this._power})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // ── Chromatic aberration fringe — edges only ──────────────
    const caAlpha = env * this._power * 0.18;
    const caRad   = cornerDist * 0.85;

    const caR = ctx.createRadialGradient(cx, cy, caRad * 0.55, cx, cy, caRad);
    caR.addColorStop(0, 'rgba(255,0,0,0)');
    caR.addColorStop(1, `rgba(255,20,0,${caAlpha})`);
    ctx.fillStyle = caR;
    ctx.fillRect(0, 0, w, h);

    const caC = ctx.createRadialGradient(cx, cy, caRad * 0.55, cx, cy, caRad);
    caC.addColorStop(0, 'rgba(0,255,255,0)');
    caC.addColorStop(1, `rgba(0,200,255,${caAlpha})`);
    ctx.fillStyle = caC;
    ctx.fillRect(0, 0, w, h);
  }

  dispose() {
    document.body.removeChild(this._canvas);
  }
}
