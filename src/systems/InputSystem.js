// ============================================================
// InputSystem.js — two-phase golf input
// Phase 1: drag near ball to set direction
// Phase 2: drag anywhere to manually set power, release to fire
// ============================================================

import { Vector2 } from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { AIM } from '../core/Constants.js';

export class InputSystem {
  constructor(renderer, camera, scene) {
    this.renderer = renderer;
    this.camera   = camera;
    this.scene    = scene;
    this.enabled  = true;

    this._phase = 'IDLE'; // 'IDLE' | 'AIMING_DIR' | 'AIMING_POWER'

    this._dragStart    = new Vector2();
    this._dragCurrent  = new Vector2();
    this._ballScreenPos = new Vector2();

    // Phase 1 locked values
    this._lockedDragVec  = null;
    this._lockedDragDist = 0;

    // Phase 2 power drag
    this._powerDragStart = new Vector2();
    this._power = 0; // 0-1, readable by HoleScene each frame

    this._buildUI();

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp   = this._onPointerUp.bind(this);
    this._onKeyDown     = this._onKeyDown.bind(this);

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown',   this._onPointerDown, { passive: false });
    canvas.addEventListener('pointermove',   this._onPointerMove, { passive: false });
    canvas.addEventListener('pointerup',     this._onPointerUp,   { passive: false });
    canvas.addEventListener('pointercancel', this._onPointerUp,   { passive: false });
    window.addEventListener('keydown', this._onKeyDown);

    this.ballPosition = null;
    this.planets = [];
  }

  // ── UI ─────────────────────────────────────────────────────

  _buildUI() {
    // Vertical power slider at bottom center
    const wrap = document.createElement('div');
    wrap.id = 'power-ring-wrap';
    wrap.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:max(64px, calc(env(safe-area-inset-bottom, 0px) + 44px))',
      'transform:translateX(-50%)',
      'display:none', 'flex-direction:column', 'align-items:center', 'gap:8px',
      'z-index:100', 'pointer-events:none',
    ].join(';');

    this._phaseLabel = document.createElement('div');
    this._phaseLabel.style.cssText = [
      'color:rgba(255,255,255,0.6)', 'font-family:monospace',
      'font-size:10px', 'letter-spacing:2px', 'text-align:center',
    ].join(';');

    // Track + fill (vertical: fills bottom→top)
    const barOuter = document.createElement('div');
    barOuter.style.cssText = [
      'width:18px', 'height:180px',
      'background:rgba(255,255,255,0.12)',
      'border-radius:9px',
      'border:1px solid rgba(255,255,255,0.25)',
      'position:relative', 'overflow:visible',
    ].join(';');

    this._powerBarFill = document.createElement('div');
    this._powerBarFill.style.cssText = [
      'position:absolute', 'left:0', 'bottom:0',
      'width:100%', 'height:0%',
      'border-radius:9px',
      'background:rgba(80,220,80,0.8)',
    ].join(';');

    // Handle
    this._powerHandle = document.createElement('div');
    this._powerHandle.style.cssText = [
      'position:absolute', 'left:50%', 'bottom:0%',
      'transform:translate(-50%, 50%)',
      'width:28px', 'height:28px',
      'background:#fff', 'border-radius:50%',
      'border:2px solid rgba(255,255,255,0.9)',
      'box-shadow:0 0 10px rgba(255,255,255,0.5)',
    ].join(';');

    barOuter.appendChild(this._powerBarFill);
    barOuter.appendChild(this._powerHandle);
    wrap.appendChild(this._phaseLabel);
    wrap.appendChild(barOuter);
    document.body.appendChild(wrap);
    this._wrap = wrap;
  }

  _showUI(label) {
    this._phaseLabel.textContent = label;
    this._wrap.style.display = 'flex';
  }

  _setBarPower(p) {
    const pct = Math.round(p * 100);
    this._powerBarFill.style.height = `${pct}%`;
    this._powerHandle.style.bottom = `${pct}%`;
    const r = Math.round(p * 255);
    const g = Math.round((1 - p * 0.7) * 220);
    const color = `rgb(${r},${g},40)`;
    this._powerBarFill.style.background = color;
    this._powerHandle.style.background = color;
    this._powerHandle.style.boxShadow = `0 0 10px ${color}`;
  }

  // ── Pointer handlers ───────────────────────────────────────

  _onPointerDown(e) {
    if (!this.enabled) return;
    e.preventDefault();

    if (this._phase === 'IDLE') {
      if (!this.ballPosition) return;
      const ptr = new Vector2(e.clientX, e.clientY);
      const ballScreen = this._projectBall();
      if (!ballScreen || ptr.distanceTo(ballScreen) > 120) return;

      this._phase = 'AIMING_DIR';
      this._dragStart.copy(ptr);
      this._dragCurrent.copy(ptr);
      this._ballScreenPos.copy(ballScreen);
      this._power = 0;
      this._setBarPower(0);
      this._showUI('AIM DIRECTION');
      eventBus.emit(Events.AIM_START);
      return;
    }

    if (this._phase === 'AIMING_POWER') {
      // Touch anywhere to start power drag — captures Y start position
      this._powerDragStart.set(e.clientX, e.clientY);
      this._power = 0;
      this._setBarPower(0);
    }
  }

  _onPointerMove(e) {
    if (this._phase === 'AIMING_DIR') {
      e.preventDefault();
      this._dragCurrent.set(e.clientX, e.clientY);

      const drag = new Vector2().subVectors(this._dragCurrent, this._ballScreenPos);
      const dist = Math.min(drag.length(), AIM.MAX_DRAG_DISTANCE);
      eventBus.emit(Events.AIM_UPDATE, {
        dragScreenVec: drag.clone(),
        dragDist: dist,
        power: dist / AIM.MAX_DRAG_DISTANCE,
      });
      return;
    }

    if (this._phase === 'AIMING_POWER') {
      e.preventDefault();
      // Y axis: drag UP from start = more power, drag back down = less
      const dy = this._powerDragStart.y - e.clientY; // positive = dragged up
      this._power = Math.max(0, Math.min(1, dy / AIM.MAX_DRAG_DISTANCE));
      this._setBarPower(this._power);
    }
  }

  _onPointerUp(e) {
    e.preventDefault();

    if (this._phase === 'AIMING_DIR') {
      // Measure movement from where the finger was placed, not from ball centre.
      // This lets players confirm a "straight" direction with a tiny drag.
      const moved = this._dragCurrent.distanceTo(this._dragStart);

      if (moved < 4) {
        // Genuine accidental tap — cancel
        this._reset();
        eventBus.emit(Events.AIM_CANCEL);
        return;
      }

      // Lock direction, enter power phase
      const drag = new Vector2().subVectors(this._dragCurrent, this._ballScreenPos);
      this._lockedDragVec  = drag.clone();
      this._lockedDragDist = Math.min(drag.length(), AIM.MAX_DRAG_DISTANCE);
      this._phase = 'AIMING_POWER';
      this._power = 0;
      this._powerDragStart.set(0, 0);
      this._setBarPower(0);
      this._showUI('DRAG UP — MORE POWER');
      eventBus.emit(Events.AIM_DIR_LOCKED, {
        dragScreenVec: this._lockedDragVec,
        dragDist:      this._lockedDragDist,
      });
      return;
    }

    if (this._phase === 'AIMING_POWER') {
      if (this._power < 0.02) {
        // No power set yet — stay in power phase, wait for user to drag
        return;
      }
      const drag  = this._lockedDragVec;
      const dist  = this._lockedDragDist;
      const power = this._power * AIM.MAX_POWER;
      this._reset();
      eventBus.emit(Events.SHOT_TAKEN, { dragScreenVec: drag, dragDist: dist, power });
    }
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') { this._reset(); eventBus.emit(Events.AIM_CANCEL); }
    if (e.key === 'm' || e.key === 'M') eventBus.emit(Events.AUDIO_MUTE_TOGGLE);
  }

  // ── Per-frame ─────────────────────────────────────────────

  update(_dt) {} // no oscillation — power is driven by user drag

  // ── Helpers ───────────────────────────────────────────────

  _projectBall() {
    if (!this.ballPosition || !this.camera) return null;
    const p = this.ballPosition.clone().project(this.camera);
    return new Vector2(
      (p.x * 0.5 + 0.5) * window.innerWidth,
      (-(p.y * 0.5) + 0.5) * window.innerHeight,
    );
  }

  _reset() {
    this._phase = 'IDLE';
    this._power = 0;
    this._lockedDragVec  = null;
    this._lockedDragDist = 0;
    this._wrap.style.display = 'none';
    this._setBarPower(0);
  }

  // ── Public API ────────────────────────────────────────────

  setBallPosition(pos) { this.ballPosition = pos; }
  setPlanets(planets)  { this.planets = planets; }
  setAiming(v)         {}
  isInPowerPhase()     { return this._phase === 'AIMING_POWER'; }

  dispose() {
    const c = this.renderer.domElement;
    c.removeEventListener('pointerdown',   this._onPointerDown);
    c.removeEventListener('pointermove',   this._onPointerMove);
    c.removeEventListener('pointerup',     this._onPointerUp);
    c.removeEventListener('pointercancel', this._onPointerUp);
    window.removeEventListener('keydown',  this._onKeyDown);
    if (this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
  }
}
