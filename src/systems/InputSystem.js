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
    this._power       = 0;

    // Direction drag state
    this._dirPtr      = null;   // active pointer ID for direction
    this._dirStart    = new Vector2();
    this._dirCurrent  = new Vector2();
    this._dirMoved    = false;  // true once drag crosses threshold

    // Power drag state
    this._pwrPtr      = null;   // active pointer ID for power bar
    this._pwrStartY   = 0;      // offset start (includes current power) for smooth continuity
    this._pwrDownY    = 0;      // raw press Y — for tap vs drag detection
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
    // SVG dimensions for the inverted pyramid
    // Wide top (W=140), narrows to a point at bottom (H=210)
    // Triangle vertices: top-left (4,4), top-right (136,4), bottom-tip (70,206)
    this._pyW = 140; this._pyH = 210;
    this._pyTipX = 70; this._pyTipY = 206;
    this._pyTopY = 4;  this._pyTopHalfW = 66; // half of top width (4..136 = 132px)
    this._lastSparkTime = 0;

    if (!document.getElementById('cosmic-power-style')) {
      const s = document.createElement('style');
      s.id = 'cosmic-power-style';
      s.textContent = `
        @keyframes label-glow { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes spark-float {
          0%   { transform:translate(0,0) scale(1); opacity:1; }
          100% { transform:translate(var(--sdx),var(--sdy)) scale(0); opacity:0; }
        }
        @keyframes py-pulse {
          0%,100% { opacity:.55; }
          50%     { opacity:1; }
        }
        @keyframes max-bloom {
          0%,100% { filter:drop-shadow(0 0 8px var(--bloom)) drop-shadow(0 0 20px var(--bloom)); }
          50%     { filter:drop-shadow(0 0 18px var(--bloom)) drop-shadow(0 0 40px var(--bloom)); }
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

    // ── Pyramid SVG container ────────────────────────────────
    const pyramidWrap = document.createElement('div');
    pyramidWrap.style.cssText = [
      `width:${this._pyW}px`, `height:${this._pyH}px`,
      'position:relative', 'pointer-events:none',
    ].join(';');
    this._pyramidWrap = pyramidWrap;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(this._pyW));
    svg.setAttribute('height', String(this._pyH));
    svg.setAttribute('viewBox', `0 0 ${this._pyW} ${this._pyH}`);
    svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;pointer-events:none;';

    const defs = document.createElementNS(NS, 'defs');

    // Clip path — inverted triangle shape
    const clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', 'py-clip');
    const clipPoly = document.createElementNS(NS, 'polygon');
    clipPoly.setAttribute('points', `4,4 136,4 ${this._pyTipX},${this._pyTipY}`);
    clip.appendChild(clipPoly);
    defs.appendChild(clip);

    // Fill gradient (bottom = red/dim, top = cyan/bright)
    const grad = document.createElementNS(NS, 'linearGradient');
    grad.setAttribute('id', 'py-fill-grad');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '1');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '0');
    [
      { offset: '0%',   color: '#cc1133', opacity: '0.55' },
      { offset: '28%',  color: '#ff4422', opacity: '0.75' },
      { offset: '55%',  color: '#cc44ff', opacity: '0.9'  },
      { offset: '78%',  color: '#3366ff', opacity: '1.0'  },
      { offset: '100%', color: '#44ffdd', opacity: '1.0'  },
    ].forEach(({ offset, color, opacity }) => {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      stop.setAttribute('stop-opacity', opacity);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);

    // Shimmer overlay gradient (left edge highlight)
    const shimGrad = document.createElementNS(NS, 'linearGradient');
    shimGrad.setAttribute('id', 'py-shim-grad');
    shimGrad.setAttribute('x1', '0'); shimGrad.setAttribute('y1', '0');
    shimGrad.setAttribute('x2', '1'); shimGrad.setAttribute('y2', '0');
    [
      { offset: '0%',   color: '#ffffff', opacity: '0.13' },
      { offset: '35%',  color: '#ffffff', opacity: '0.04' },
      { offset: '100%', color: '#ffffff', opacity: '0.0'  },
    ].forEach(({ offset, color, opacity }) => {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      stop.setAttribute('stop-opacity', opacity);
      shimGrad.appendChild(stop);
    });
    defs.appendChild(shimGrad);

    svg.appendChild(defs);

    // Dark background triangle
    const bgTri = document.createElementNS(NS, 'polygon');
    bgTri.setAttribute('points', `4,4 136,4 ${this._pyTipX},${this._pyTipY}`);
    bgTri.setAttribute('fill', '#05060f');
    bgTri.setAttribute('stroke', 'rgba(80,130,220,0.28)');
    bgTri.setAttribute('stroke-width', '1.5');
    bgTri.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(bgTri);

    // Fill rect — grows from bottom-tip upward, clipped to triangle
    const fillRect = document.createElementNS(NS, 'rect');
    fillRect.setAttribute('x', '0');
    fillRect.setAttribute('y', String(this._pyH));
    fillRect.setAttribute('width', String(this._pyW));
    fillRect.setAttribute('height', '0');
    fillRect.setAttribute('fill', 'url(#py-fill-grad)');
    fillRect.setAttribute('clip-path', 'url(#py-clip)');
    this._svgFill = fillRect;
    svg.appendChild(fillRect);

    // Shimmer overlay (clipped to triangle)
    const shimRect = document.createElementNS(NS, 'rect');
    shimRect.setAttribute('x', '0'); shimRect.setAttribute('y', '0');
    shimRect.setAttribute('width', String(this._pyW));
    shimRect.setAttribute('height', String(this._pyH));
    shimRect.setAttribute('fill', 'url(#py-shim-grad)');
    shimRect.setAttribute('clip-path', 'url(#py-clip)');
    svg.appendChild(shimRect);

    // Outline triangle on top (colored by power)
    const outlineTri = document.createElementNS(NS, 'polygon');
    outlineTri.setAttribute('points', `4,4 136,4 ${this._pyTipX},${this._pyTipY}`);
    outlineTri.setAttribute('fill', 'none');
    outlineTri.setAttribute('stroke', 'rgba(80,130,220,0.5)');
    outlineTri.setAttribute('stroke-width', '1.5');
    outlineTri.setAttribute('stroke-linejoin', 'round');
    this._outlineTri = outlineTri;
    svg.appendChild(outlineTri);

    // Horizontal fill-level line (glowing edge at fill top)
    const levelLine = document.createElementNS(NS, 'line');
    levelLine.setAttribute('stroke', '#ffffff');
    levelLine.setAttribute('stroke-width', '1.5');
    levelLine.setAttribute('stroke-linecap', 'round');
    levelLine.setAttribute('opacity', '0');
    this._levelLine = levelLine;
    svg.appendChild(levelLine);

    // Power % label inside pyramid (near top) — optional, small
    const pyLabel = document.createElementNS(NS, 'text');
    pyLabel.setAttribute('x', String(this._pyTipX));
    pyLabel.setAttribute('y', '28');
    pyLabel.setAttribute('text-anchor', 'middle');
    pyLabel.setAttribute('font-family', 'monospace');
    pyLabel.setAttribute('font-size', '10');
    pyLabel.setAttribute('fill', 'rgba(200,230,255,0.0)');
    pyLabel.setAttribute('letter-spacing', '1');
    this._pyPctLabel = pyLabel;
    svg.appendChild(pyLabel);

    pyramidWrap.appendChild(svg);
    this._svg = svg;

    // Tick marks on left and right edges of pyramid (3 evenly spaced at 25%, 50%, 75%)
    [0.25, 0.5, 0.75].forEach(frac => {
      // Position at that fraction of the height from top (within 4..206)
      const innerH = this._pyTipY - this._pyTopY; // 202
      const yPos   = this._pyTopY + innerH * frac;
      // Half-width of triangle at this y (linearly narrows to 0 at tip)
      const hw     = this._pyTopHalfW * (1 - frac);
      const cx     = this._pyTipX;

      [[-1, -6], [1, 6]].forEach(([side, tickLen]) => {
        const tick = document.createElementNS(NS, 'line');
        const edgeX = cx + side * hw;
        tick.setAttribute('x1', String(edgeX));
        tick.setAttribute('y1', String(yPos));
        tick.setAttribute('x2', String(edgeX + tickLen));
        tick.setAttribute('y2', String(yPos));
        tick.setAttribute('stroke', 'rgba(100,160,255,0.35)');
        tick.setAttribute('stroke-width', '1');
        tick.setAttribute('stroke-linecap', 'round');
        svg.appendChild(tick);
      });
    });

    // Particle layer (DOM, positioned over SVG)
    const particles = document.createElement('div');
    particles.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      `width:${this._pyW}px`, `height:${this._pyH}px`,
      'overflow:visible', 'pointer-events:none',
    ].join(';');
    this._particles = particles;
    pyramidWrap.appendChild(particles);

    wrap.appendChild(this._label);
    wrap.appendChild(pyramidWrap);
    document.body.appendChild(wrap);
    this._wrap = wrap;
  }

  _showLabel(text) {
    this._label.textContent = text;
    this._wrap.style.display = 'flex';
  }

  _setBarPower(p) {
    // Geometry: triangle from y=4 (top, full width) to y=206 (tip, width=0)
    const innerH   = this._pyTipY - this._pyTopY; // 202
    const fillH    = p * innerH;
    const fillTop  = this._pyTipY - fillH;

    this._svgFill.setAttribute('y',      String(fillTop));
    this._svgFill.setAttribute('height', String(fillH + (this._pyH - this._pyTipY)));

    // Hue ramps: 0 (red) → 30 (orange) → 270 (purple) → 210 (cyan) as p goes 0→1
    const h    = Math.round(p < 0.5 ? p * 60 : 60 + (p - 0.5) * 400);
    const hCap = Math.min(h, 210);
    const glow = `hsl(${hCap},90%,62%)`;
    const dim  = `hsl(${hCap},80%,42%)`;

    // Outline stroke brightens with power
    this._outlineTri.setAttribute('stroke',
      p > 0.05 ? `hsla(${hCap},85%,65%,${0.35 + p * 0.55})` : 'rgba(80,130,220,0.28)');
    this._outlineTri.setAttribute('stroke-width', String(1.5 + p * 1.5));

    // Drop-shadow glow on the whole pyramid
    if (p > 0.05) {
      const glowPx = 4 + p * 14;
      this._pyramidWrap.style.filter =
        `drop-shadow(0 0 ${glowPx}px ${glow}) drop-shadow(0 0 ${glowPx * 2}px ${dim}88)`;
      if (p > 0.9) {
        this._pyramidWrap.style.setProperty('--bloom', glow);
        this._pyramidWrap.style.animation = 'max-bloom 0.6s ease-in-out infinite';
      } else {
        this._pyramidWrap.style.animation = 'none';
      }
    } else {
      this._pyramidWrap.style.filter    = 'none';
      this._pyramidWrap.style.animation = 'none';
    }

    // Level line at fill top edge (width matches triangle at that y)
    if (p > 0.02) {
      const yFromTop  = fillTop - this._pyTopY;
      const hw        = this._pyTopHalfW * (1 - yFromTop / innerH);
      const cx        = this._pyTipX;
      this._levelLine.setAttribute('x1', String(cx - hw + 2));
      this._levelLine.setAttribute('x2', String(cx + hw - 2));
      this._levelLine.setAttribute('y1', String(fillTop));
      this._levelLine.setAttribute('y2', String(fillTop));
      this._levelLine.setAttribute('stroke', glow);
      this._levelLine.setAttribute('stroke-width', String(1 + p * 2));
      this._levelLine.setAttribute('opacity', String(0.5 + p * 0.45));
    } else {
      this._levelLine.setAttribute('opacity', '0');
    }

    // Pct label fades in above 50%; also drive the small pyramid label text
    if (p > 0.5) {
      this._pyPctLabel.setAttribute('fill', `rgba(200,230,255,${(p - 0.5) * 1.2})`);
      this._pyPctLabel.textContent = `${Math.round(p * 100)}%`;
    } else {
      this._pyPctLabel.setAttribute('fill', 'rgba(200,230,255,0)');
    }

    // Update pyramid sub-label to reflect current state
    if (this._label) {
      this._label.textContent = p > 0.02 ? 'TAP PYRAMID TO SHOOT' : 'DRAG PYRAMID FOR POWER';
    }

    // Particles at high power (throttled)
    const now = Date.now();
    if (p > 0.72 && now - this._lastSparkTime > 120) {
      this._lastSparkTime = now;
      this._spawnParticle(p, hCap);
      if (p > 0.88) this._spawnParticle(p, hCap); // double rate near max
    }

    eventBus.emit(Events.AIM_POWER_UPDATE, { power: p });
  }

  _spawnParticle(p, h) {
    const el   = document.createElement('div');
    const size = 1.5 + Math.random() * 2.5;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 18 + Math.random() * 38;
    const dx    = Math.round(Math.cos(angle) * dist);
    const dy    = Math.round(Math.sin(angle) * dist - 10); // bias upward

    // Spawn from a point along the top portion of the fill
    const innerH  = this._pyTipY - this._pyTopY;
    const frac    = (1 - p) + Math.random() * p * 0.4; // near fill top
    const yPos    = Math.round(this._pyTopY + innerH * frac);
    const hw      = this._pyTopHalfW * (1 - frac);
    const xPos    = Math.round(this._pyTipX + (Math.random() * 2 - 1) * hw * 0.85);

    el.style.cssText = [
      'position:absolute',
      `left:${xPos}px`, `top:${yPos}px`,
      `width:${size.toFixed(1)}px`, `height:${size.toFixed(1)}px`,
      'border-radius:50%',
      `background:hsl(${h},95%,72%)`,
      `box-shadow:0 0 ${(size * 2).toFixed(1)}px hsl(${h},90%,70%)`,
      `--sdx:${dx}px`, `--sdy:${dy}px`,
      'animation:spark-float 0.55s ease-out forwards',
      'pointer-events:none',
    ].join(';');

    this._particles.appendChild(el);
    setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 600);
  }

  _isOverBar(x, y) {
    if (this._wrap.style.display === 'none') return false;
    const r   = this._pyramidWrap.getBoundingClientRect();
    const pad = 28;
    return x >= r.left - pad && x <= r.right  + pad &&
           y >= r.top  - pad && y <= r.bottom + pad;
  }

  // ── Pointer handlers ───────────────────────────────────────

  _onDown(e) {
    if (!this.enabled) return;
    if (gameState.ballInFlight) return;
    e.preventDefault();

    // Enter AIMING on first press anywhere
    if (this._phase === 'IDLE') {
      this._phase = 'AIMING';
      this._setBarPower(0);
      this._showLabel('DRAG PYRAMID FOR POWER');
      eventBus.emit(Events.AIM_START);
    }

    if (this._phase !== 'AIMING') return;

    // Pyramid touch → power drag (or tap-to-shoot if released with minimal movement)
    if (this._isOverBar(e.clientX, e.clientY)) {
      this._pwrPtr     = e.pointerId;
      this._pwrDownY   = e.clientY;  // raw Y — for tap detection
      this._pwrStartY  = e.clientY + this._power * AIM.MAX_DRAG_DISTANCE; // offset for continuity
      this._pwrMaxMove = 0;
      return;
    }

    // Playable area touch → direction drag (tap does nothing; only drag moves aim)
    if (this._dirPtr === null) {
      this._dirPtr    = e.pointerId;
      this._dirStart.set(e.clientX, e.clientY);
      this._dirCurrent.set(e.clientX, e.clientY);
      this._dirMoved  = false;
    }
  }

  _onMove(e) {
    if (this._phase !== 'AIMING') return;
    e.preventDefault();

    // Power drag
    if (e.pointerId === this._pwrPtr) {
      const dy = this._pwrStartY - e.clientY;
      this._power      = Math.max(0, Math.min(1, dy / AIM.MAX_DRAG_DISTANCE));
      this._setBarPower(this._power);
      this._pwrMaxMove = Math.max(this._pwrMaxMove, Math.abs(e.clientY - this._pwrDownY));
      return;
    }

    // Direction drag — only activates after 8px threshold
    if (e.pointerId === this._dirPtr) {
      this._dirCurrent.set(e.clientX, e.clientY);
      const moved = this._dirCurrent.distanceTo(this._dirStart);

      if (moved < 8 && !this._dirMoved) return;

      if (!this._dirMoved) {
        this._dirMoved = true;
        eventBus.emit(Events.AIM_DIR_LOCKED);
      }

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

    // Pyramid pointer released
    if (e.pointerId === this._pwrPtr) {
      this._pwrPtr = null;
      // Tap (minimal movement) on pyramid → fire if power and direction are set
      if (this._pwrMaxMove < 10) {
        if (this._power > 0.02 && this._lastDragDist > 0) {
          this._fire();
        } else if (this._power <= 0.02) {
          // Nudge: no power yet
          this._label.textContent = 'DRAG PYRAMID UP FOR POWER';
        }
      }
      // Large movement → power was dragged; just keep the value, stay in AIMING
      return;
    }

    // Direction drag released — stop tracking, stay in AIMING
    if (e.pointerId === this._dirPtr) {
      const wasTap = !this._dirMoved;
      this._dirPtr   = null;
      this._dirMoved = false;
      // Tap on canvas (no drag): if power is set, fire with current facing direction
      if (wasTap && this._power > 0.02) {
        if (this._lastDragDist < 0.1) {
          // Provide a non-zero default so _computeShotVelocity doesn't bail;
          // HoleScene ignores the actual vector and uses _facingDir for direction.
          this._lastDragVec.set(0, -10);
          this._lastDragDist = 10;
        }
        this._fire();
      }
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
    this._phase      = 'IDLE';
    this._power      = 0;
    this._dirPtr     = null;
    this._pwrPtr     = null;
    this._dirMoved   = false;
    this._pwrMaxMove = 0;
    this._lastDragVec.set(0, 0);
    this._lastDragDist       = 0;
    this._wrap.style.display = 'none';
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
