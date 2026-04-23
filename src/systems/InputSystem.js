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

    // Orbital capture toggle state
    this._orbitToggleAllowed = false;
    this._orbitActive = false;

    this._trajectoryStatus = null;
    this._freecamActive = false;
    this._freecamPtr = null;
    this._freecamLast = new Vector2();
    this._freecamMode = 'look';
    this._keys = new Set();
    this._freecamTouchMove = new Vector2();

    this._buildUI();
    this._setupEventListeners();

    this._onDown   = this._onDown.bind(this);
    this._onMove   = this._onMove.bind(this);
    this._onUp     = this._onUp.bind(this);
    this._onKey    = this._onKey.bind(this);
    this._onKeyUp  = this._onKeyUp.bind(this);

    const c = renderer.domElement;
    c.addEventListener('pointerdown',   this._onDown, { passive: false });
    c.addEventListener('pointermove',   this._onMove, { passive: false });
    c.addEventListener('pointerup',     this._onUp,   { passive: false });
    c.addEventListener('pointercancel', this._onUp,   { passive: false });
    window.addEventListener('keydown',  this._onKey);
    window.addEventListener('keyup',    this._onKeyUp);

    this.ballPosition = null;
    this.planets      = [];
  }

  _setupEventListeners() {
    eventBus.on(Events.HOLE_LOADED, () => {
      this._updateFreecamBtn();
    });
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
      'color:rgba(182,140,255,.92)', 'font-family:Orbitron,sans-serif',
      'font-size:10px', 'letter-spacing:0.18em', 'text-align:center', 'text-transform:uppercase',
      'animation:label-glow 2s ease-in-out infinite', 'pointer-events:none',
    ].join(';');

    // ── Pyramid SVG container ────────────────────────────────
    const pyramidWrap = document.createElement('div');
    pyramidWrap.id = 'power-pyramid-wrap';
    pyramidWrap.style.cssText = [
      `width:${this._pyW}px`, `height:${this._pyH}px`,
      'position:relative', 'pointer-events:none',
      'filter:drop-shadow(0 18px 36px rgba(8,5,24,0.46))',
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
    bgTri.setAttribute('fill', '#0b0718');
    bgTri.setAttribute('stroke', 'rgba(132,92,255,0.4)');
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
    outlineTri.setAttribute('stroke', 'rgba(156,92,255,0.7)');
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
        tick.setAttribute('stroke', 'rgba(148,102,255,0.3)');
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

    // ── Orbit toggle button (planet icon below pyramid) ─────
    const orbitBtn = document.createElement('div');
    orbitBtn.style.cssText = [
      'width:38px', 'height:38px',
      'border-radius:50%',
      'display:none',
      'align-items:center', 'justify-content:center',
      'cursor:pointer',
      'pointer-events:auto',
      'background:linear-gradient(180deg, rgba(11,8,22,0.88), rgba(8,5,18,0.84))',
      'border:1px solid rgba(132,92,255,0.38)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
      'transition:border-color 0.2s,box-shadow 0.2s,background 0.2s',
      'touch-action:manipulation',
      'user-select:none',
      '-webkit-user-select:none',
    ].join(';');
    this._orbitBtn = orbitBtn;

    const freecamBtn = document.createElement('div');
    freecamBtn.id = 'freecam-btn';
    freecamBtn.style.cssText = [
      'min-width:82px', 'height:34px', 'padding:0 12px',
      'border-radius:999px',
      'display:none',
      'align-items:center', 'justify-content:center',
      'cursor:pointer',
      'pointer-events:auto',
      'background:linear-gradient(180deg, rgba(11,8,22,0.88), rgba(8,5,18,0.84))',
      'border:1px solid rgba(132,92,255,0.38)',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
      'transition:border-color 0.2s,box-shadow 0.2s,background 0.2s',
      'touch-action:manipulation',
      'user-select:none',
      '-webkit-user-select:none',
      'color:rgba(239,232,255,0.94)',
      'font-family:Orbitron,sans-serif',
      'font-size:9px',
      'letter-spacing:0.16em',
      'text-transform:uppercase',
    ].join(';');
    freecamBtn.textContent = 'Freecam';
    this._freecamBtn = freecamBtn;

    const freecamPad = document.createElement('div');
    freecamPad.style.cssText = [
      'display:none',
      'position:fixed',
      'left:max(18px,calc(env(safe-area-inset-left,0px) + 12px))',
      'bottom:max(118px,calc(env(safe-area-inset-bottom,0px) + 98px))',
      'width:132px',
      'height:132px',
      'border-radius:50%',
      'background:radial-gradient(circle, rgba(20,28,42,0.82) 0%, rgba(8,12,20,0.62) 70%, rgba(8,12,20,0.1) 100%)',
      'border:1px solid rgba(120,255,210,0.2)',
      'backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'pointer-events:auto',
      'touch-action:none',
      'z-index:101',
    ].join(';');
    this._freecamPad = freecamPad;

    const freecamStick = document.createElement('div');
    freecamStick.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:46px',
      'height:46px',
      'margin-left:-23px',
      'margin-top:-23px',
      'border-radius:50%',
      'background:rgba(170,255,230,0.18)',
      'border:1px solid rgba(180,255,240,0.38)',
      'box-shadow:0 0 18px rgba(120,255,210,0.12)',
      'pointer-events:none',
      'transition:transform 0.06s linear',
    ].join(';');
    this._freecamStick = freecamStick;
    freecamPad.appendChild(freecamStick);

    freecamPad.addEventListener('pointerdown', (e) => {
      if (!this._freecamActive) return;
      e.preventDefault();
      e.stopPropagation();
      this._updateFreecamPad(e);
    });
    freecamPad.addEventListener('pointermove', (e) => {
      if (!this._freecamActive) return;
      if ((e.buttons & 1) === 0 && e.pointerType !== 'touch') return;
      e.preventDefault();
      e.stopPropagation();
      this._updateFreecamPad(e);
    });
    const resetPad = (e) => {
      if (!this._freecamActive) return;
      e.preventDefault();
      e.stopPropagation();
      this._freecamTouchMove.set(0, 0);
      this._updateFreecamStick();
    };
    freecamPad.addEventListener('pointerup', resetPad);
    freecamPad.addEventListener('pointercancel', resetPad);

    document.body.appendChild(freecamPad);

    freecamBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      eventBus.emit(Events.FREECAM_TOGGLE);
    });

    // SVG planet/Saturn icon
    const orbNS = 'http://www.w3.org/2000/svg';
    const orbSvg = document.createElementNS(orbNS, 'svg');
    orbSvg.setAttribute('width', '28');
    orbSvg.setAttribute('height', '28');
    orbSvg.setAttribute('viewBox', '0 0 28 28');
    orbSvg.style.overflow = 'visible';

    // Planet body (circle)
    const planetCircle = document.createElementNS(orbNS, 'circle');
    planetCircle.setAttribute('cx', '14');
    planetCircle.setAttribute('cy', '14');
    planetCircle.setAttribute('r', '6');
    planetCircle.setAttribute('fill', 'rgba(100,180,255,0.85)');
    planetCircle.setAttribute('stroke', 'rgba(160,220,255,0.6)');
    planetCircle.setAttribute('stroke-width', '1');
    orbSvg.appendChild(planetCircle);

    // Saturn ring (ellipse)
    const ring = document.createElementNS(orbNS, 'ellipse');
    ring.setAttribute('cx', '14');
    ring.setAttribute('cy', '14');
    ring.setAttribute('rx', '12');
    ring.setAttribute('ry', '4');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'rgba(160,220,255,0.7)');
    ring.setAttribute('stroke-width', '1.5');
    ring.setAttribute('transform', 'rotate(-20 14 14)');
    orbSvg.appendChild(ring);

    orbitBtn.appendChild(orbSvg);
    wrap.appendChild(freecamBtn);
    wrap.appendChild(orbitBtn);

    orbitBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._orbitToggleAllowed) {
        eventBus.emit(Events.ORBIT_TOGGLE);
      }
    });

    document.body.appendChild(wrap);
    this._wrap = wrap;
  }

  _showLabel(text) {
    this._label.textContent = text;
    this._wrap.style.display = 'flex';
    this._updateFreecamBtn();
  }

  setTrajectoryStatus(outcome) {
    this._trajectoryStatus = outcome;
    if (!this._label) return;
    const labels = {
      cup:          'WILL HOLE',
      wormhole:     'WORMHOLE',
      boss_weakspot:'HITS WEAK POINT',
      boss_block:   'BLOCKED BY BOSS',
      settled:      'LANDS ON PLANET',
      pinned:       'LANDS ON PLANET',
      zero_g_stuck: 'LANDS ON PLANET',
      oob:          'OUT OF BOUNDS',
      limit:        'TAP PYRAMID TO SHOOT',
    };
    if (outcome && outcome !== 'limit') {
      this._label.textContent = labels[outcome] ?? 'TAP PYRAMID TO SHOOT';
      const isOob = outcome === 'oob';
      this._label.style.color = isOob
        ? 'rgba(255,80,60,.95)'
        : outcome === 'cup'
        ? 'rgba(80,255,220,.95)'
        : outcome === 'boss_weakspot'
        ? 'rgba(255,214,120,.95)'
        : outcome === 'boss_block'
        ? 'rgba(255,120,90,.95)'
        : 'rgba(160,210,255,.85)';
    } else {
      this._label.style.color = 'rgba(160,210,255,.85)';
      // text will be set by _setBarPower
    }
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

    // Update pyramid sub-label to reflect current state (trajectory status overrides when set)
    if (this._label && !this._trajectoryStatus) {
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
    if (this._freecamActive) {
      if (this._freecamPad && this._freecamPad.contains(e.target)) return;
      e.preventDefault();
      this._freecamPtr = e.pointerId;
      this._freecamLast.set(e.clientX, e.clientY);
      this._freecamMode = e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.5
        ? 'move'
        : 'look';
      return;
    }
    if (gameState.ballInFlight) return;
    e.preventDefault();

    // Pyramid touch → power drag (or tap-to-shoot if released with minimal movement)
    if (this._isOverBar(e.clientX, e.clientY)) {
      this._pwrPtr     = e.pointerId;
      this._pwrDownY   = e.clientY;
      this._pwrStartY  = e.clientY + this._power * AIM.MAX_DRAG_DISTANCE;
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
    if (this._freecamActive && e.pointerId === this._freecamPtr) {
      e.preventDefault();
      const dx = e.clientX - this._freecamLast.x;
      const dy = e.clientY - this._freecamLast.y;
      this._freecamLast.set(e.clientX, e.clientY);
      eventBus.emit(Events.FREECAM_DRAG, {
        dx,
        dy,
        mode: this._freecamMode,
        pointerType: e.pointerType,
      });
      return;
    }
    if (gameState.ballInFlight) return;
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
    if (this._freecamActive && e.pointerId === this._freecamPtr) {
      e.preventDefault();
      this._freecamPtr = null;
      return;
    }
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
    this._keys.add(e.code);
    if (e.code === 'KeyC') {
      eventBus.emit(Events.FREECAM_TOGGLE);
      return;
    }
    if (e.key === 'Escape') {
      if (this._freecamActive) {
        eventBus.emit(Events.FREECAM_TOGGLE);
      } else {
        this._reset(); eventBus.emit(Events.AIM_CANCEL);
      }
    }
    if (e.key === 'r' || e.key === 'R') { this._reset(); eventBus.emit(Events.BALL_RESET_TO_TEE); }
    if (e.key === 'm' || e.key === 'M') eventBus.emit(Events.AUDIO_MUTE_TOGGLE);
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
    if (this._freecamActive && this._keys.size === 0) {
      eventBus.emit(Events.FREECAM_MOVE, { x: 0, y: 0, z: 0, boost: false, dt: 0 });
    }
  }

  // ── Per-frame ─────────────────────────────────────────────

  update(dt) {
    if (this._freecamActive) {
      let x = this._freecamTouchMove.x;
      let y = 0;
      let z = -this._freecamTouchMove.y;
      if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) x -= 1;
      if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) x += 1;
      if (this._keys.has('Space') || this._keys.has('KeyE')) y += 1;
      if (this._keys.has('ShiftLeft') || this._keys.has('ShiftRight') || this._keys.has('KeyQ')) y -= 1;
      if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) z += 1;
      if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) z -= 1;
      eventBus.emit(Events.FREECAM_MOVE, {
        x, y, z,
        boost: this._keys.has('AltLeft') || this._keys.has('AltRight'),
        dt,
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  _fire() {
    const drag  = this._lastDragVec.clone();
    const dist  = this._lastDragDist;
    const power = this._power * AIM.MAX_POWER;
    this._resetForShot();
    eventBus.emit(Events.SHOT_TAKEN, { dragScreenVec: drag, dragDist: dist, power });
  }

  _resetForShot() {
    this._phase      = 'IDLE';
    this._power      = 0;
    this._dirPtr     = null;
    this._pwrPtr     = null;
    this._dirMoved   = false;
    this._pwrMaxMove = 0;
    this._lastDragVec.set(0, 0);
    this._lastDragDist = 0;
    this._setBarPower(0);
    this._orbitToggleAllowed = false;
    this._orbitActive = false;
    this._updateOrbitBtn();
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
    this._lastDragDist = 0;
    this._setBarPower(0);
    this._orbitToggleAllowed = false;
    this._orbitActive = false;
    this._updateOrbitBtn();
  }

  // ── Public API ────────────────────────────────────────────

  setBallPosition(pos) { this.ballPosition = pos; }
  setPlanets(planets)  { this.planets = planets; }
  setAiming(v)         {}
  setFreecamActive(v) {
    this._freecamActive = v;
    this._freecamPtr = null;
    this._freecamTouchMove.set(0, 0);
    this._updateFreecamStick();
    this._updateFreecamBtn();
    if (v) {
      this._wrap.style.display = 'flex';
      this._label.textContent = 'FREECAM: WASD QE, DRAG TO LOOK';
    }
  }
  isInPowerPhase()     { return this._power > 0.02; }
  setOrbitToggleAllowed(v) {
    this._orbitToggleAllowed = v;
    if (!v) this._orbitActive = false;
    this._updateOrbitBtn();
  }
  setOrbitActive(v) {
    this._orbitActive = v;
    this._updateOrbitBtn();
  }
  get orbitActive() { return this._orbitActive; }

  _updateOrbitBtn() {
    // Orbit feature disabled — always hide the button
    if (this._orbitBtn) this._orbitBtn.style.display = 'none';
  }

  _updateFreecamBtn() {
    if (!this._freecamBtn) return;
    const mobile = window.matchMedia('(pointer: coarse)').matches;
    const showFreecam = mobile;
    this._freecamBtn.style.display = showFreecam ? 'flex' : 'none';
    if (this._freecamPad) this._freecamPad.style.display = mobile && this._freecamActive ? 'block' : 'none';
    this._freecamBtn.textContent = this._freecamActive ? 'Return' : 'Freecam';
    this._freecamBtn.style.borderColor = this._freecamActive
      ? 'rgba(255,190,120,0.55)'
      : 'rgba(120,255,210,0.35)';
    this._freecamBtn.style.boxShadow = this._freecamActive
      ? '0 0 18px rgba(255,190,120,0.22)'
      : 'none';

    if (this._wrap) {
      if (mobile) {
        this._wrap.style.bottom = showFreecam
          ? 'max(102px, calc(env(safe-area-inset-bottom,0px) + 88px))'
          : 'max(102px, calc(env(safe-area-inset-bottom,0px) + 120px))';
        this._wrap.style.gap = showFreecam ? '8px' : '4px';
      } else {
        this._wrap.style.bottom = 'max(64px,calc(env(safe-area-inset-bottom,0px) + 44px))';
        this._wrap.style.gap = '10px';
      }
    }
  }

  _updateFreecamPad(e) {
    const rect = this._freecamPad.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    let dx = (e.clientX - cx) / (rect.width * 0.5);
    let dy = (e.clientY - cy) / (rect.height * 0.5);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this._freecamTouchMove.set(dx, dy);
    this._updateFreecamStick();
  }

  _updateFreecamStick() {
    if (!this._freecamStick) return;
    const max = 34;
    const x = this._freecamTouchMove.x * max;
    const y = this._freecamTouchMove.y * max;
    this._freecamStick.style.transform = `translate(${x}px, ${y}px)`;
  }

  showBar() {
    this._showLabel('DRAG PYRAMID FOR POWER');
    this._setBarPower(this._power);
  }

  hideBar() {
    if (this._freecamActive) {
      this._wrap.style.display = 'flex';
      this._updateFreecamBtn();
      return;
    }
    this._wrap.style.display = 'none';
  }

  dispose() {
    const c = this.renderer.domElement;
    c.removeEventListener('pointerdown',   this._onDown);
    c.removeEventListener('pointermove',   this._onMove);
    c.removeEventListener('pointerup',     this._onUp);
    c.removeEventListener('pointercancel', this._onUp);
    window.removeEventListener('keydown',  this._onKey);
    window.removeEventListener('keyup',    this._onKeyUp);
    if (this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    if (this._freecamPad?.parentNode) this._freecamPad.parentNode.removeChild(this._freecamPad);
  }
}
