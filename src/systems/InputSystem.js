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
    this._powerLocked = false;
    this._powerGestureMaxMove = 0;
    this._oscillateT = 0;

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
    // Inject keyframe animations — only decorative, never on dragged elements
    if (!document.getElementById('cosmic-power-style')) {
      const style = document.createElement('style');
      style.id = 'cosmic-power-style';
      style.textContent = `
        @keyframes handle-spin {
          from { transform:translate(-50%,50%) rotate(0deg); }
          to   { transform:translate(-50%,50%) rotate(360deg); }
        }
        @keyframes label-glow {
          0%,100% { opacity:0.7; }
          50%      { opacity:1; }
        }
        @keyframes nebula-scroll {
          0%   { background-position: 0 200px; }
          100% { background-position: 0 0px; }
        }
      `;
      document.head.appendChild(style);
    }

    // Outer wrapper
    const wrap = document.createElement('div');
    wrap.id = 'power-ring-wrap';
    wrap.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:max(64px, calc(env(safe-area-inset-bottom, 0px) + 44px))',
      'transform:translateX(-50%)',
      'display:none', 'flex-direction:column', 'align-items:center', 'gap:10px',
      'z-index:100', 'pointer-events:none',
    ].join(';');

    // Phase label
    this._phaseLabel = document.createElement('div');
    this._phaseLabel.style.cssText = [
      'color:rgba(160,210,255,0.85)', 'font-family:monospace',
      'font-size:10px', 'letter-spacing:3px', 'text-align:center',
      'animation:label-glow 2s ease-in-out infinite',
    ].join(';');

    // Bar container — no overflow:hidden so corona bleeds out
    this._barOuter = document.createElement('div');
    this._barOuter.style.cssText = [
      'width:22px', 'height:200px',
      'border-radius:11px',
      'position:relative', 'overflow:visible',
    ].join(';');

    // Track — deep space background, clipped
    const barTrack = document.createElement('div');
    barTrack.style.cssText = [
      'position:absolute', 'inset:0',
      'border-radius:11px',
      'overflow:hidden',
      'background:#060814',
      'border:1px solid rgba(100,160,255,0.3)',
    ].join(';');

    // Scrolling nebula texture inside track (decorative, independent of fill height)
    const nebulaScroll = document.createElement('div');
    nebulaScroll.style.cssText = [
      'position:absolute', 'inset:0',
      // tall tile so animation has room to scroll
      'background-image:',
      // dot cluster A
      'radial-gradient(1.5px 1.5px at 5px  20px, rgba(180,140,255,0.8) 0%, transparent 100%),',
      'radial-gradient(1px   1px   at 15px 45px, rgba(255,255,255,0.6) 0%, transparent 100%),',
      'radial-gradient(1px   1px   at 3px  75px, rgba(140,200,255,0.7) 0%, transparent 100%),',
      'radial-gradient(1.5px 1.5px at 18px 100px,rgba(255,180,120,0.6) 0%, transparent 100%),',
      'radial-gradient(1px   1px   at 8px  130px,rgba(255,255,255,0.5) 0%, transparent 100%),',
      'radial-gradient(1px   1px   at 13px 160px,rgba(120,220,180,0.7) 0%, transparent 100%),',
      'radial-gradient(1.5px 1.5px at 2px  185px,rgba(200,140,255,0.6) 0%, transparent 100%)',
      ';background-size:22px 200px',
      ';animation:nebula-scroll 4s linear infinite',
    ].join('');

    // Fill — the active power indicator, no CSS transitions (tracks finger directly)
    this._powerBarFill = document.createElement('div');
    this._powerBarFill.style.cssText = [
      'position:absolute', 'left:0', 'bottom:0',
      'width:100%', 'height:0%',
      'border-radius:11px',
      // static gradient clipped by height — no animation that fights JS updates
      'background:linear-gradient(to top, #ff3355 0%, #cc44ff 45%, #3388ff 80%, #44ffdd 100%)',
      'background-size:100% 200px',
      'background-position:0 bottom',
    ].join(';');

    // Shimmer highlight on fill (purely decorative, doesn't move)
    const shimmer = document.createElement('div');
    shimmer.style.cssText = [
      'position:absolute', 'inset:0', 'border-radius:11px',
      'background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.12) 50%,transparent 100%)',
      'pointer-events:none',
    ].join(';');
    this._powerBarFill.appendChild(shimmer);

    barTrack.appendChild(nebulaScroll);
    barTrack.appendChild(this._powerBarFill);

    // Corona glow behind handle — no CSS transition
    this._powerCorona = document.createElement('div');
    this._powerCorona.style.cssText = [
      'position:absolute', 'left:50%', 'bottom:0%',
      'transform:translate(-50%, 50%)',
      'width:40px', 'height:40px',
      'border-radius:50%',
      'pointer-events:none',
      'will-change:bottom',
    ].join(';');

    // Handle — planet sphere, spinning ring animation (transform not hijacked by JS)
    this._powerHandle = document.createElement('div');
    this._powerHandle.style.cssText = [
      'position:absolute', 'left:50%', 'bottom:0%',
      'transform:translate(-50%, 50%)',
      'width:26px', 'height:26px',
      'border-radius:50%',
      'background:radial-gradient(circle at 36% 36%, #d0eeff 0%, #5588ff 55%, #1133aa 100%)',
      'border:1.5px solid rgba(160,200,255,0.9)',
      'box-shadow:0 0 10px rgba(80,140,255,0.9), 0 0 22px rgba(60,100,255,0.4)',
      // spin uses transform — BUT we set bottom via style.bottom so they don't conflict
      'animation:handle-spin 3s linear infinite',
      'will-change:bottom',
    ].join(';');

    // Tick marks (left side, so they don't overlap handle)
    const ticks = document.createElement('div');
    ticks.style.cssText = 'position:absolute;left:-9px;top:0;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:4px 0;pointer-events:none;';
    [0.7, 0.45, 0.35, 0.45, 0.7].forEach((w, i) => {
      const t = document.createElement('div');
      t.style.cssText = `width:${Math.round(w * 10)}px;height:1px;background:rgba(100,160,255,${i === 0 || i === 4 ? 0.65 : 0.3});`;
      ticks.appendChild(t);
    });

    this._barOuter.appendChild(barTrack);
    this._barOuter.appendChild(this._powerCorona);
    this._barOuter.appendChild(this._powerHandle);
    this._barOuter.appendChild(ticks);
    wrap.appendChild(this._phaseLabel);
    wrap.appendChild(this._barOuter);
    document.body.appendChild(wrap);
    this._wrap = wrap;
  }

  _showUI(label) {
    this._phaseLabel.textContent = label;
    this._wrap.style.display = 'flex';
  }

  _setBarPower(p) {
    const pct = (p * 100).toFixed(2);

    // Height + position — no transitions, tracks pointer exactly
    this._powerBarFill.style.height = `${pct}%`;
    this._powerHandle.style.bottom  = `${pct}%`;
    this._powerCorona.style.bottom  = `${pct}%`;

    // Color: blue(220) → purple(280) → red(0/360) as power rises
    const hue  = (220 + p * 200) % 360;  // 220→60 wrapping through purple→red
    // easier: lerp 220→10 (blue→red via purple)
    const h    = Math.round(220 - p * 210);
    const glow = `hsl(${h},90%,60%)`;
    const dim  = `hsl(${h},80%,45%)`;

    this._powerHandle.style.boxShadow = `0 0 ${10 + p * 16}px ${glow}, 0 0 ${22 + p * 28}px ${dim}66`;
    this._powerHandle.style.borderColor = glow;

    // Corona size + color
    const cs = 34 + Math.round(p * 28);
    this._powerCorona.style.width      = `${cs}px`;
    this._powerCorona.style.height     = `${cs}px`;
    this._powerCorona.style.background = `radial-gradient(circle, ${glow}50 0%, transparent 68%)`;

    // Bar outer border glow
    this._barOuter.style.boxShadow = `0 0 0 1px ${glow}33, 0 0 ${10 + p * 20}px ${dim}44`;
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
      eventBus.emit(Events.AIM_START);
      return;
    }

    if (this._phase === 'AIMING_POWER') {
      if (this._powerLocked) {
        // Oscillating mode: second tap fires at current power
        const drag  = this._lockedDragVec;
        const dist  = this._lockedDragDist;
        const power = this._power * AIM.MAX_POWER;
        this._reset();
        eventBus.emit(Events.SHOT_TAKEN, { dragScreenVec: drag, dragDist: dist, power });
        return;
      }
      // Start tracking a new gesture (drag or tap TBD on pointerup)
      this._powerDragStart.set(e.clientX, e.clientY);
      this._powerGestureMaxMove = 0;
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
      if (this._powerLocked) return; // oscillating — ignore moves
      const dy = this._powerDragStart.y - e.clientY;
      this._power = Math.max(0, Math.min(1, dy / AIM.MAX_DRAG_DISTANCE));
      this._setBarPower(this._power);
      const moved = Math.abs(dy);
      if (moved > this._powerGestureMaxMove) this._powerGestureMaxMove = moved;
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
      const wasDrag = this._powerGestureMaxMove > 10;
      if (wasDrag) {
        // Drag → release: fire immediately
        const drag  = this._lockedDragVec;
        const dist  = this._lockedDragDist;
        const power = this._power * AIM.MAX_POWER;
        this._reset();
        eventBus.emit(Events.SHOT_TAKEN, { dragScreenVec: drag, dragDist: dist, power });
      } else {
        // Tap → start oscillating power bar, wait for second tap
        this._powerLocked  = true;
        this._oscillateT   = 0;
        this._power        = 0;
        this._setBarPower(0);
        this._showUI('TAP TO SHOOT');
      }
    }
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') { this._reset(); eventBus.emit(Events.AIM_CANCEL); }
    if (e.key === 'r' || e.key === 'R') { this._reset(); eventBus.emit(Events.BALL_RESET_TO_TEE); }
    if (e.key === 'm' || e.key === 'M') eventBus.emit(Events.AUDIO_MUTE_TOGGLE);
  }

  // ── Per-frame ─────────────────────────────────────────────

  update(dt) {
    if (this._phase === 'AIMING_POWER' && this._powerLocked) {
      // Oscillate 0→1→0 at increasing speed — classic golf power meter
      this._oscillateT += dt;
      const speed = 1.2 + this._oscillateT * 0.3; // accelerates over time
      this._power = (Math.sin(this._oscillateT * speed * Math.PI) + 1) / 2;
      this._setBarPower(this._power);
    }
  }

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
    this._powerLocked = false;
    this._powerGestureMaxMove = 0;
    this._oscillateT = 0;
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
