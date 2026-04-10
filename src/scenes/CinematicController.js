// ============================================================
// CinematicController.js
//
// One smooth camera arc from the black hole → high overview →
// behind the ball. No pauses, no cuts — a single 5-second
// quadratic bezier sweep driven by easeInOutCubic.
//
// Camera position  : bezier( nearCup, overview, behindBall )
// Camera lookAt    : bezier( cup,     midpoint,  ball       )
// ============================================================

import { Vector3 } from 'three';

// ── Easing ────────────────────────────────────────────────────
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Quadratic bezier ─────────────────────────────────────────
function bezier3(p0, p1, p2, t) {
  const mt = 1 - t;
  return p0.clone().multiplyScalar(mt * mt)
    .addScaledVector(p1, 2 * mt * t)
    .addScaledVector(p2, t * t);
}

// ── Total duration (seconds) ──────────────────────────────────
const DURATION = 5.0;

export class CinematicController {
  constructor(camera, onComplete) {
    this._camera     = camera;
    this._onComplete = onComplete;
    this._active     = false;
    this._t          = 0;
    this._wp         = null;
    this._skipBtn    = null;
  }

  get active() { return this._active; }

  start(cupPos, teePos, facingDir, followDist, followH) {
    this._active = true;
    this._t      = 0;

    const toTee    = new Vector3().subVectors(teePos, cupPos);
    const horzDist = new Vector3(toTee.x, 0, toTee.z).length();
    const axisDirH = new Vector3(toTee.x, 0, toTee.z).normalize();
    const perpH    = new Vector3(-axisDirH.z, 0, axisDirH.x);

    // ── Camera position bezier control points ─────────────

    // P0 — start: close behind/above the black hole
    const p0 = cupPos.clone()
      .addScaledVector(axisDirH, -30)
      .add(new Vector3(0, 20, 0));

    // P1 — arc control: high overview, offset sideways
    const mid = cupPos.clone().lerp(teePos, 0.5);
    const ovH = Math.max(220, horzDist * 0.75);
    const p1  = mid.clone()
      .add(new Vector3(0, ovH, 0))
      .addScaledVector(perpH, horzDist * 0.35);

    // P2 — end: normal behind-ball gameplay camera position
    const facing   = facingDir.clone().normalize();
    const behind   = facing.clone().negate();
    const worldUp  = Math.abs(facing.y) < 0.95
      ? new Vector3(0, 1, 0) : new Vector3(0, 0, -1);
    const camRight = new Vector3().crossVectors(facing, worldUp).normalize();
    const camUp    = new Vector3().crossVectors(camRight, facing).normalize();
    const p2 = teePos.clone()
      .addScaledVector(behind, followDist)
      .addScaledVector(camUp,  followH);

    // ── LookAt bezier control points ──────────────────────

    const l0 = cupPos.clone().add(new Vector3(0, 4, 0));  // look at cup
    const l1 = mid.clone().add(new Vector3(0, 20, 0));     // look at midpoint
    const l2 = teePos.clone().addScaledVector(facing, 8);  // look at ball

    this._wp = { p0, p1, p2, l0, l1, l2 };

    // Snap to opening frame
    this._camera.position.copy(p0);
    this._camera.lookAt(l0);

    this._showSkipButton();
  }

  update(dt) {
    if (!this._active || !this._wp) return;

    this._t += dt;
    const raw = Math.min(this._t / DURATION, 1);
    const e   = easeInOutCubic(raw);

    const { p0, p1, p2, l0, l1, l2 } = this._wp;
    const pos  = bezier3(p0, p1, p2, e);
    const look = bezier3(l0, l1, l2, e);

    this._camera.position.copy(pos);
    this._camera.lookAt(look);

    if (raw >= 1) this._end();
  }

  skip() {
    if (!this._active || !this._wp) return;
    const { p2, l2 } = this._wp;
    this._camera.position.copy(p2);
    this._camera.lookAt(l2);
    this._end();
  }

  dispose() {
    this._active = false;
    this._hideSkipButton();
  }

  _end() {
    this._active = false;
    this._hideSkipButton();
    this._onComplete?.();
  }

  _showSkipButton() {
    this._hideSkipButton();

    const btn = document.createElement('button');
    btn.id = 'cinematic-skip';
    btn.textContent = 'SKIP';
    btn.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:800',
      'background:transparent',
      'border:1px solid rgba(255,255,255,0.25)',
      'color:rgba(255,255,255,0.55)',
      'font-family:monospace',
      'font-size:11px',
      'letter-spacing:4px',
      'padding:10px 32px',
      'cursor:pointer',
      'border-radius:3px',
      'opacity:0',
      'transition:opacity 0.6s ease, color 0.15s, border-color 0.15s',
      'pointer-events:auto',
    ].join(';');

    btn.addEventListener('mouseenter', () => {
      btn.style.color       = 'rgba(255,255,255,0.9)';
      btn.style.borderColor = 'rgba(255,255,255,0.6)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color       = 'rgba(255,255,255,0.55)';
      btn.style.borderColor = 'rgba(255,255,255,0.25)';
    });
    btn.addEventListener('click', () => this.skip());

    document.body.appendChild(btn);
    this._skipBtn = btn;

    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (this._skipBtn) this._skipBtn.style.opacity = '1';
    }));
  }

  _hideSkipButton() {
    if (!this._skipBtn) return;
    const btn = this._skipBtn;
    this._skipBtn = null;
    btn.style.opacity = '0';
    setTimeout(() => btn.parentNode?.removeChild(btn), 600);
  }
}
