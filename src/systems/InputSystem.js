// ============================================================
// InputSystem.js
//
// IDLE  → tap near ball → AIMING
//
// AIMING (power NOT locked):
//   drag anywhere (not bar) → updates direction (only once moving, not on press)
//   slide bar up/down       → sets power; release with power > 0 → LOCKED
//
// AIMING (power LOCKED, power > 0):
//   press anywhere (not bar) → FIRE
//   slide bar again          → re-sets power; release → re-LOCKED or reset
//
// Power = 0 → nothing fires, bar resets.
// ============================================================

import { Vector2 } from 'three';
import { eventBus, Events } from '../core/EventBus.js';
import { AIM } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';

export class InputSystem {
  constructor(renderer, camera, scene) {
    this.renderer = renderer;
    this.camera   = camera;
    this.scene    = scene;
    this.enabled  = true;

    this._phase       = 'IDLE'; // 'IDLE' | 'AIMING'
    this._powerLocked = false;
    this._power       = 0;

    // Direction drag state
    this._dirPtr      = null;   // active pointer ID for direction
    this._dirStart    = new Vector2();
    this._dirCurrent  = new Vector2();
    this._dirMoved    = false;  // true once drag crosses threshold

    // Power drag state
    this._pwrPtr      = null;   // active pointer ID for power bar
    this._pwrStartY   = 0;
    this._pwrMaxMove  = 0;

    // Last confirmed direction (sent with SHOT_TAKEN)
    this._lastDragVec  = new Vector2();
    this._lastDragDist = 0;

    this._buildUI();

    this._onDown   = this._onDown.bind(this);
    this._onMove   = this._onMove.bind(this);
    this._onUp     = this._onUp.bind(this);
    this._onKey    = this._onKey.bind(this);

    const c = renderer.domElement;
    c.addEventListener('pointerdown',   this._onDown, { passive: false });
    c.addEventListener('pointermove',   this._onMove, { passive: false });
    c.addEventListener('pointerup',     this._onUp,   { passive: false });
    c.addEventListener('pointercancel', this._onUp,   { passive: false });
    window.addEventListener('keydown',  this._onKey);

    this.ballPosition = null;
    this.planets      = [];
  }

  // ── UI (all pointer-events:none — canvas handles everything) ─

  _buildUI() {
    if (!document.getElementById('cosmic-power-style')) {
      const s = document.createElement('style');
      s.id = 'cosmic-power-style';
      s.textContent = `
        @keyframes handle-spin {
          from { transform:translate(-50%,50%) rotate(0deg); }
          to   { transform:translate(-50%,50%) rotate(360deg); }
        }
        @keyframes label-glow { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes nebula-scroll {
          0%   { background-position: 0 200px; }
          100% { background-position: 0 0; }
        }
      `;
      document.head.appendChild(s);
    }

    const wrap = document.createElement('div');
    wrap.id = 'power-ring-wrap';
    wrap.style.cssText = [
      'position:fixed', 'left:50%',
      'bottom:max(64px,calc(env(safe-area-inset-bottom,0px) + 44px))',
      'transform:translateX(-50%)',
      'display:none', 'flex-direction:column', 'align-items:center', 'gap:10px',
      'z-index:100', 'pointer-events:none',
    ].join(';');

    this._label = document.createElement('div');
    this._label.style.cssText = [
      'color:rgba(160,210,255,.85)', 'font-family:monospace',
      'font-size:10px', 'letter-spacing:3px', 'text-align:center',
      'animation:label-glow 2s ease-in-out infinite', 'pointer-events:none',
    ].join(';');

    this._barOuter = document.createElement('div');
    this._barOuter.style.cssText = [
      'width:22px', 'height:200px', 'border-radius:11px',
      'position:relative', 'overflow:visible', 'pointer-events:none',
    ].join(';');

    const track = document.createElement('div');
    track.style.cssText = [
      'position:absolute', 'inset:0', 'border-radius:11px', 'overflow:hidden',
      'background:#060814', 'border:1px solid rgba(100,160,255,.3)', 'pointer-events:none',
    ].join(';');

    const nebula = document.createElement('div');
    nebula.style.cssText = [
      'position:absolute', 'inset:0', 'pointer-events:none',
      'background-image:',
      'radial-gradient(1.5px 1.5px at 5px 20px,rgba(180,140,255,.8) 0%,transparent 100%),',
      'radial-gradient(1px 1px at 15px 45px,rgba(255,255,255,.6) 0%,transparent 100%),',
      'radial-gradient(1px 1px at 3px 75px,rgba(140,200,255,.7) 0%,transparent 100%),',
      'radial-gradient(1.5px 1.5px at 18px 100px,rgba(255,180,120,.6) 0%,transparent 100%),',
      'radial-gradient(1px 1px at 8px 130px,rgba(255,255,255,.5) 0%,transparent 100%),',
      'radial-gradient(1px 1px at 13px 160px,rgba(120,220,180,.7) 0%,transparent 100%),',
      'radial-gradient(1.5px 1.5px at 2px 185px,rgba(200,140,255,.6) 0%,transparent 100%)',
      ';background-size:22px 200px;animation:nebula-scroll 4s linear infinite',
    ].join('');

    this._fill = document.createElement('div');
    this._fill.style.cssText = [
      'position:absolute', 'left:0', 'bottom:0', 'width:100%', 'height:0%',
      'border-radius:11px',
      'background:linear-gradient(to top,#ff3355 0%,#cc44ff 45%,#3388ff 80%,#44ffdd 100%)',
      'background-size:100% 200px', 'background-position:0 bottom', 'pointer-events:none',
    ].join(';');

    const shimmer = document.createElement('div');
    shimmer.style.cssText = [
      'position:absolute', 'inset:0', 'border-radius:11px', 'pointer-events:none',
      'background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.12) 50%,transparent 100%)',
    ].join(';');
    this._fill.appendChild(shimmer);

    this._corona = document.createElement('div');
    this._corona.style.cssText = [
      'position:absolute', 'left:50%', 'bottom:0',
      'transform:translate(-50%,50%)', 'width:40px', 'height:40px',
      'border-radius:50%', 'pointer-events:none', 'will-change:bottom',
    ].join(';');

    this._handle = document.createElement('div');
    this._handle.style.cssText = [
      'position:absolute', 'left:50%', 'bottom:0',
      'transform:translate(-50%,50%)', 'width:26px', 'height:26px',
      'border-radius:50%',
      'background:radial-gradient(circle at 36% 36%,#d0eeff 0%,#5588ff 55%,#1133aa 100%)',
      'border:1.5px solid rgba(160,200,255,.9)',
      'box-shadow:0 0 10px rgba(80,140,255,.9),0 0 22px rgba(60,100,255,.4)',
      'animation:handle-spin 3s linear infinite', 'will-change:bottom', 'pointer-events:none',
    ].join(';');

    const ticks = document.createElement('div');
    ticks.style.cssText = 'position:absolute;left:-9px;top:0;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:4px 0;pointer-events:none;';
    [0.7, 0.45, 0.35, 0.45, 0.7].forEach((w, i) => {
      const t = document.createElement('div');
      t.style.cssText = `width:${Math.round(w * 10)}px;height:1px;background:rgba(100,160,255,${i === 0 || i === 4 ? .65 : .3});`;
      ticks.appendChild(t);
    });

    track.appendChild(nebula);
    track.appendChild(this._fill);
    this._barOuter.appendChild(track);
    this._barOuter.appendChild(this._corona);
    this._barOuter.appendChild(this._handle);
    this._barOuter.appendChild(ticks);
    wrap.appendChild(this._label);
    wrap.appendChild(this._barOuter);
    document.body.appendChild(wrap);
    this._wrap = wrap;
  }

  _showLabel(text) {
    this._label.textContent = text;
    this._wrap.style.display = 'flex';
  }

  _setBarPower(p) {
    const pct  = (p * 100).toFixed(1);
    this._fill.style.height        = `${pct}%`;
    this._handle.style.bottom      = `${pct}%`;
    this._corona.style.bottom      = `${pct}%`;

    const h    = Math.round(220 - p * 210);
    const glow = `hsl(${h},90%,60%)`;
    const dim  = `hsl(${h},80%,45%)`;

    this._handle.style.boxShadow   = `0 0 ${10 + p*16}px ${glow},0 0 ${22+p*28}px ${dim}66`;
    this._handle.style.borderColor = glow;

    const cs = 34 + Math.round(p * 28);
    this._corona.style.width       = `${cs}px`;
    this._corona.style.height      = `${cs}px`;
    this._corona.style.background  = `radial-gradient(circle,${glow}50 0%,transparent 68%)`;
    this._barOuter.style.boxShadow = `0 0 0 1px ${glow}33,0 0 ${10+p*20}px ${dim}44`;
    eventBus.emit(Events.AIM_POWER_UPDATE, { power: p });
  }

  _isOverBar(x, y) {
    if (this._wrap.style.display === 'none') return false;
    const r   = this._barOuter.getBoundingClientRect();
    const pad = 32;
    return x >= r.left - pad && x <= r.right  + pad &&
           y >= r.top  - pad && y <= r.bottom + pad;
  }

  // ── Pointer handlers ───────────────────────────────────────

  _onDown(e) {
    if (!this.enabled) return;
    if (gameState.ballInFlight) return;
    e.preventDefault();

    // Enter AIMING on first press anywhere — fall through to start direction tracking
    if (this._phase === 'IDLE') {
      this._phase       = 'AIMING';
      this._power       = 0;
      this._powerLocked = false;
      this._setBarPower(0);
      this._showLabel('SLIDE BAR TO SET POWER');
      eventBus.emit(Events.AIM_START);
      // no return — same gesture immediately starts direction drag below
    }

    if (this._phase !== 'AIMING') return;

    // Bar touch → power drag
    if (this._isOverBar(e.clientX, e.clientY)) {
      this._pwrPtr     = e.pointerId;
      // Offset start so dragging from current handle position feels continuous
      this._pwrStartY  = e.clientY + this._power * AIM.MAX_DRAG_DISTANCE;
      this._pwrMaxMove = 0;
      return;
    }

    // Screen press with power locked → FIRE
    if (this._powerLocked && this._power > 0.02) {
      this._fire();
      return;
    }

    // Otherwise → start tracking a potential direction drag
    if (this._dirPtr === null) {
      this._dirPtr     = e.pointerId;
      this._dirStart.set(e.clientX, e.clientY);
      this._dirCurrent.set(e.clientX, e.clientY);
      this._dirMoved   = false;
    }
  }

  _onMove(e) {
    if (this._phase !== 'AIMING') return;
    e.preventDefault();

    // Power drag
    if (e.pointerId === this._pwrPtr) {
      const dy = this._pwrStartY - e.clientY;
      this._power       = Math.max(0, Math.min(1, dy / AIM.MAX_DRAG_DISTANCE));
      this._powerLocked = false; // unlock while finger is down
      this._setBarPower(this._power);
      this._pwrMaxMove  = Math.max(this._pwrMaxMove, Math.abs(dy - this._power * AIM.MAX_DRAG_DISTANCE + (this._pwrStartY - e.clientY - dy)));

      // Track movement for tap vs drag detection
      const rawDy = Math.abs(e.clientY - (this._pwrStartY - this._power * AIM.MAX_DRAG_DISTANCE));
      this._pwrMaxMove = Math.max(this._pwrMaxMove, Math.abs(this._pwrStartY - e.clientY));
      return;
    }

    // Direction drag — only activates after threshold
    if (e.pointerId === this._dirPtr) {
      this._dirCurrent.set(e.clientX, e.clientY);
      const moved = this._dirCurrent.distanceTo(this._dirStart);

      if (moved < 8 && !this._dirMoved) return; // ignore tiny jitter

      if (!this._dirMoved) {
        // First real movement — reset base direction
        this._dirMoved = true;
        eventBus.emit(Events.AIM_DIR_LOCKED);
      }

      // Direction is relative to where the drag started
      const drag = new Vector2().subVectors(this._dirCurrent, this._dirStart);
      const dist = Math.min(drag.length(), AIM.MAX_DRAG_DISTANCE);
      this._lastDragVec.copy(drag);
      this._lastDragDist = dist;
      eventBus.emit(Events.AIM_UPDATE, {
        dragScreenVec: drag.clone(),
        dragDist:      dist,
        power:         dist / AIM.MAX_DRAG_DISTANCE,
      });
    }
  }

  _onUp(e) {
    e.preventDefault();

    // Power drag released
    if (e.pointerId === this._pwrPtr) {
      this._pwrPtr = null;
      if (this._power > 0.02) {
        this._powerLocked = true;
        this._showLabel('PRESS ANYWHERE TO SHOOT');
        eventBus.emit(Events.AIM_POWER_LOCKED, { power: this._power });
      } else {
        this._powerLocked = false;
        this._power       = 0;
        this._setBarPower(0);
        this._showLabel('SLIDE BAR TO SET POWER');
      }
      return;
    }

    // Direction drag released — just stop tracking, no fire
    if (e.pointerId === this._dirPtr) {
      this._dirPtr   = null;
      this._dirMoved = false;
    }
  }

  _onKey(e) {
    if (e.key === 'Escape') { this._reset(); eventBus.emit(Events.AIM_CANCEL); }
    if (e.key === 'r' || e.key === 'R') { this._reset(); eventBus.emit(Events.BALL_RESET_TO_TEE); }
    if (e.key === 'm' || e.key === 'M') eventBus.emit(Events.AUDIO_MUTE_TOGGLE);
  }

  // ── Per-frame ─────────────────────────────────────────────

  update(_dt) {}

  // ── Helpers ───────────────────────────────────────────────

  _fire() {
    const drag  = this._lastDragVec.clone();
    const dist  = this._lastDragDist;
    const power = this._power * AIM.MAX_POWER;
    this._reset();
    eventBus.emit(Events.SHOT_TAKEN, { dragScreenVec: drag, dragDist: dist, power });
  }

  _projectBall() {
    if (!this.ballPosition || !this.camera) return null;
    const p = this.ballPosition.clone().project(this.camera);
    return new Vector2(
      ( p.x * 0.5 + 0.5) * window.innerWidth,
      (-p.y * 0.5 + 0.5) * window.innerHeight,
    );
  }

  _reset() {
    this._phase       = 'IDLE';
    this._power       = 0;
    this._powerLocked = false;
    this._dirPtr      = null;
    this._pwrPtr      = null;
    this._dirMoved    = false;
    this._pwrMaxMove  = 0;
    this._lastDragVec.set(0, 0);
    this._lastDragDist        = 0;
    this._wrap.style.display  = 'none';
    this._setBarPower(0);
  }

  // ── Public API ────────────────────────────────────────────

  setBallPosition(pos) { this.ballPosition = pos; }
  setPlanets(planets)  { this.planets = planets; }
  setAiming(v)         {}
  isInPowerPhase()     { return this._phase === 'AIMING'; }

  dispose() {
    const c = this.renderer.domElement;
    c.removeEventListener('pointerdown',   this._onDown);
    c.removeEventListener('pointermove',   this._onMove);
    c.removeEventListener('pointerup',     this._onUp);
    c.removeEventListener('pointercancel', this._onUp);
    window.removeEventListener('keydown',  this._onKey);
    if (this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
  }
}
