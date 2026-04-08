// ============================================================
// LaunchWarp.js — ripping-through-the-void effect on ball launch
// Scales with shot power (0..1):
//   • FOV kick: camera widens then snaps back
//   • Speed lines: CSS canvas overlay radial streaks
//   • Vignette flash: screen edges darken briefly
// ============================================================

import { CAMERA } from '../core/Constants.js';

export class LaunchWarp {
  constructor(camera) {
    this.camera   = camera;
    this._active  = false;
    this._elapsed = 0;
    this._duration = 0;
    this._fovKick  = 0;   // extra degrees at peak

    this._buildOverlay();
  }

  // ── DOM overlay for speed lines + vignette ────────────────

  _buildOverlay() {
    this._canvas = document.createElement('canvas');
    const s = this._canvas.style;
    s.position   = 'fixed';
    s.inset      = '0';
    s.width      = '100%';
    s.height     = '100%';
    s.pointerEvents = 'none';
    s.zIndex     = '50';
    s.opacity    = '0';
    document.body.appendChild(this._canvas);

    this._ctx = this._canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this._canvas.width  = window.innerWidth;
    this._canvas.height = window.innerHeight;
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * @param {number} power  normalised 0..1 (AIM.MAX_POWER already applied)
   */
  trigger(power) {
    const p = Math.max(0, Math.min(1, power));
    this._active   = true;
    this._elapsed  = 0;
    this._power    = p;
    this._duration = 1.1 + p * 0.7;     // 1.1 – 1.8 s
    this._fovKick  = 8 + p * 20;         // 8 – 28° extra FOV
  }

  update(dt) {
    if (!this._active) return;

    this._elapsed += dt;
    const t = Math.min(this._elapsed / this._duration, 1);

    // Envelope: fast attack (t < 0.08) then slow decay
    const env = t < 0.08
      ? t / 0.08
      : 1 - ((t - 0.08) / 0.92);

    // ── FOV kick ──
    this.camera.fov = CAMERA.FOV + this._fovKick * env;
    this.camera.updateProjectionMatrix();

    // ── Overlay alpha ──
    const alpha = env * (0.35 + this._power * 0.45);
    this._canvas.style.opacity = String(alpha);

    this._drawFrame(env);

    if (t >= 1) {
      this._active = false;
      this.camera.fov = CAMERA.FOV;
      this.camera.updateProjectionMatrix();
      this._canvas.style.opacity = '0';
    }
  }

  _drawFrame(env) {
    const w = this._canvas.width;
    const h = this._canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const ctx = this._ctx;

    ctx.clearRect(0, 0, w, h);

    // ── Speed lines ──────────────────────────────────────────
    const lineCount = Math.floor(60 + this._power * 80);
    const maxLen    = Math.hypot(cx, cy) * (0.6 + this._power * 0.35) * env;

    ctx.save();
    ctx.strokeStyle = `rgba(200, 220, 255, ${0.6 * env})`;
    ctx.lineWidth   = 0.8 + this._power * 0.8;

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2;
      const inner = maxLen * (0.25 + Math.random() * 0.1);
      const outer = maxLen * (0.65 + Math.random() * 0.35);

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();

    // ── Vignette flash ───────────────────────────────────────
    const vig = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
    vig.addColorStop(0,   'rgba(0,0,0,0)');
    vig.addColorStop(0.55,'rgba(0,0,0,0)');
    vig.addColorStop(1,   `rgba(0,0,20,${0.7 * env * this._power})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // ── Chromatic aberration hint — cyan/red fringe at edges ─
    const caAlpha = env * this._power * 0.18;
    const caRad   = Math.hypot(cx, cy) * 0.85;

    const caR = ctx.createRadialGradient(cx, cy, caRad * 0.55, cx, cy, caRad);
    caR.addColorStop(0,   'rgba(255,0,0,0)');
    caR.addColorStop(1,   `rgba(255,20,0,${caAlpha})`);
    ctx.fillStyle = caR;
    ctx.fillRect(0, 0, w, h);

    const caC = ctx.createRadialGradient(cx, cy, caRad * 0.55, cx, cy, caRad);
    caC.addColorStop(0,   'rgba(0,255,255,0)');
    caC.addColorStop(1,   `rgba(0,200,255,${caAlpha})`);
    ctx.fillStyle = caC;
    ctx.fillRect(0, 0, w, h);
  }

  dispose() {
    document.body.removeChild(this._canvas);
  }
}
