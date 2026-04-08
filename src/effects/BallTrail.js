// ============================================================
// BallTrail.js — flaming meteorite trail
//
// Trail = multi-lane fan of fire particles, WIDE at the ball and
// tapering to a sharp point at the tail (exactly like reference).
//
// Layers:
//   _auraPoints  — fire cloud swirling around ball (existing, kept)
//   _trailPoints — LANES × HISTORY particles spanning perp to velocity
//   _emberPoints — bright sparks clustered tightly behind the ball
// ============================================================

import {
  BufferGeometry, Float32BufferAttribute, PointsMaterial,
  Points, AdditiveBlending, CanvasTexture, Vector3,
} from 'three';

// ── Geometry constants ────────────────────────────────────
const AURA_COUNT    = 28;
const TRAIL_HISTORY = 60;   // how many past positions we keep
const LANES         = 9;    // flame lanes across width (-4…0…+4)
const HALF_LANES    = (LANES - 1) / 2;           // 4
const LANE_HALF_W   = 2.6;  // world units — half-width of flame at ball
const TRAIL_COUNT   = TRAIL_HISTORY * LANES;
const EMBER_COUNT   = 80;

// Reusable vectors (no per-frame allocation)
const _fwd  = new Vector3();
const _perp = new Vector3();
const _up   = new Vector3(0, 1, 0);
const _alt  = new Vector3(1, 0, 0);

// ── Sprite textures ───────────────────────────────────────
function makeFireSprite() {
  const sz = 128, h = sz / 2;
  const c  = document.createElement('canvas');
  c.width  = c.height = sz;
  const ctx = c.getContext('2d');
  const g   = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.00, 'rgba(255,255,200,1.0)');
  g.addColorStop(0.12, 'rgba(255,210, 60,0.95)');
  g.addColorStop(0.30, 'rgba(255, 90,  0,0.80)');
  g.addColorStop(0.55, 'rgba(210, 20,  0,0.45)');
  g.addColorStop(0.80, 'rgba(120,  0,  0,0.15)');
  g.addColorStop(1.00, 'rgba(  0,  0,  0,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sz, sz);
  return new CanvasTexture(c);
}

function makeEmberSprite() {
  const sz = 64, h = sz / 2;
  const c  = document.createElement('canvas');
  c.width  = c.height = sz;
  const ctx = c.getContext('2d');
  const g   = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.0, 'rgba(255,255,220,1.0)');
  g.addColorStop(0.3, 'rgba(255,160, 20,0.80)');
  g.addColorStop(0.7, 'rgba(255, 40,  0,0.30)');
  g.addColorStop(1.0, 'rgba(  0,  0,  0,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sz, sz);
  return new CanvasTexture(c);
}

// ── Helpers ───────────────────────────────────────────────
function buildPts(scene, count, size, tex, order) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color',    new Float32BufferAttribute(col, 3));
  geo.setDrawRange(0, 0);
  const mat = new PointsMaterial({
    size, map: tex, vertexColors: true,
    transparent: true, depthWrite: false, depthTest: false,
    blending: AdditiveBlending, sizeAttenuation: true, alphaTest: 0.001,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder   = order;
  scene.add(pts);
  return { pts, geo, pos, col };
}

// Perpendicular to 'fwd' in the most horizontal plane
function getPerpTo(fwd, out) {
  const ref = Math.abs(fwd.dot(_up)) < 0.95 ? _up : _alt;
  out.crossVectors(ref, fwd).normalize();
}

// Seeded jitter that drifts slowly with time
function jitter(i, axis, t) {
  const h = Math.sin(i * 127.1 + axis * 311.7 + t * 1.5) * 43758.5453;
  return (h - Math.floor(h) - 0.5) * 2;
}

// ─────────────────────────────────────────────────────────

export class BallTrail {
  constructor(scene) {
    this._history = [];
    this._active  = false;
    this._t       = 0;

    const fireTex  = makeFireSprite();
    const emberTex = makeEmberSprite();
    this._fireTex  = fireTex;
    this._emberTex = emberTex;

    // Aura (fire cloud around ball — large soft blobs)
    this._aura   = buildPts(scene, AURA_COUNT,  7.5, fireTex,  95);

    // Trail (multi-lane fan, wide at ball → narrow at tail)
    this._trail  = buildPts(scene, TRAIL_COUNT, 5.0, fireTex,  94);

    // Embers (tight bright sparks just behind ball)
    this._embers = buildPts(scene, EMBER_COUNT, 2.2, emberTex, 96);
  }

  setActive(active) {
    this._active = active;
    if (!active) {
      this._history = [];
      for (const layer of [this._aura, this._trail, this._embers])
        layer.geo.setDrawRange(0, 0);
    }
  }

  update(ballPos, dt = 0.016) {
    this._t += dt;
    const t = this._t;

    if (!this._active) {
      for (const layer of [this._aura, this._trail, this._embers])
        layer.geo.setDrawRange(0, 0);
      return;
    }

    // ── History ─────────────────────────────────────────────
    this._history.unshift({ x: ballPos.x, y: ballPos.y, z: ballPos.z });
    if (this._history.length > TRAIL_HISTORY) this._history.pop();
    const n = this._history.length;

    // ── AURA: fire cloud swirling around ball ────────────────
    const AURA_R = 2.6;
    for (let i = 0; i < AURA_COUNT; i++) {
      const phase  = (i / AURA_COUNT) * Math.PI * 2;
      const wobble = t * (1.1 + (i % 7) * 0.22);
      const r      = AURA_R * (0.4 + 0.6 * Math.abs(Math.sin(wobble * 0.7 + i)));
      const ang    = phase + t * 0.55 + Math.sin(t * 2.0 + i) * 0.5;
      const vy     = Math.sin(wobble * 0.9 + i * 0.8) * AURA_R * 0.55;

      this._aura.pos[i*3]     = ballPos.x + Math.cos(ang) * r;
      this._aura.pos[i*3 + 1] = ballPos.y + vy;
      this._aura.pos[i*3 + 2] = ballPos.z + Math.sin(ang) * r;

      const bright = 0.25 + 0.75 * Math.abs(Math.sin(t * 4.5 + i * 1.3));
      this._aura.col[i*3]     = bright;
      this._aura.col[i*3 + 1] = bright * (0.15 + 0.2 * Math.sin(t * 3 + i));
      this._aura.col[i*3 + 2] = 0;
    }
    this._aura.geo.attributes.position.needsUpdate = true;
    this._aura.geo.attributes.color.needsUpdate    = true;
    this._aura.geo.setDrawRange(0, AURA_COUNT);

    // ── TRAIL: multi-lane fan ────────────────────────────────
    // For each history position, compute the perpendicular to travel
    // direction, then place LANES particles spanning that perp axis.
    // Width = LANE_HALF_W * 2 at the head, tapering to 0 at the tail.

    let pIdx = 0; // write index into trail pos/col arrays

    for (let i = 0; i < n; i++) {
      const p = this._history[i];

      // Travel direction at this history point
      if (i + 1 < n) {
        const q = this._history[i + 1];
        _fwd.set(p.x - q.x, p.y - q.y, p.z - q.z);
        if (_fwd.lengthSq() > 0.0001) _fwd.normalize();
        else _fwd.set(0, 0, 1);
      }
      // else reuse previous _fwd

      getPerpTo(_fwd, _perp);

      // taper: wide at head (i=0), zero at tail (i=n-1)
      const frac  = 1 - i / (n - 1 || 1);  // 1 at head, 0 at tail
      const taper = Math.pow(frac, 0.65);   // eased taper (less harsh)
      const width = LANE_HALF_W * taper;

      // fade: bright at head, dark at tail
      const fade  = Math.pow(frac, 1.4);

      for (let lane = 0; lane < LANES; lane++) {
        const laneT    = (lane - HALF_LANES) / HALF_LANES; // -1..+1
        const offset   = laneT * width;

        // Lane brightness: bright in center, dimmer at edges (Gaussian-ish)
        const laneBr   = Math.exp(-laneT * laneT * 2.0);

        this._trail.pos[pIdx*3]     = p.x + _perp.x * offset;
        this._trail.pos[pIdx*3 + 1] = p.y + _perp.y * offset;
        this._trail.pos[pIdx*3 + 2] = p.z + _perp.z * offset;

        const bright = fade * laneBr;
        // Fire colour: white-yellow at head → orange → red at tail
        this._trail.col[pIdx*3]     = bright;
        this._trail.col[pIdx*3 + 1] = bright * Math.max(0, frac * 1.35 - 0.1);
        this._trail.col[pIdx*3 + 2] = bright * Math.max(0, frac * 0.55 - 0.3);

        pIdx++;
      }
    }

    this._trail.geo.attributes.position.needsUpdate = true;
    this._trail.geo.attributes.color.needsUpdate    = true;
    this._trail.geo.setDrawRange(0, pIdx);

    // ── EMBERS: bright sparks tightly clustered behind ball ──
    // Embers sit in the first ~20% of the trail (near ball) and flicker
    // rapidly — gives the "sparks flying off the surface" look.
    for (let i = 0; i < EMBER_COUNT; i++) {
      // Map ember to a recent history position (first 25% of trail)
      const histIdx = Math.floor((i / EMBER_COUNT) * Math.min(n, Math.floor(TRAIL_HISTORY * 0.28)));
      const p = this._history[histIdx] ?? this._history[0];

      // Spread: tight cone behind ball, using perp + backward direction
      const spreadR = 1.4 * (1 - histIdx / TRAIL_HISTORY);
      this._embers.pos[i*3]     = p.x + jitter(i, 0, t) * spreadR;
      this._embers.pos[i*3 + 1] = p.y + jitter(i, 1, t) * spreadR * 0.5;
      this._embers.pos[i*3 + 2] = p.z + jitter(i, 2, t) * spreadR;

      // Rapid intense flicker — each ember pulses independently
      const pulse  = Math.abs(Math.sin(t * 18 + i * 3.7));
      const ageFrac = 1 - histIdx / Math.min(n, TRAIL_HISTORY * 0.28);
      const ef     = pulse * ageFrac;

      this._embers.col[i*3]     = ef;
      this._embers.col[i*3 + 1] = ef * 0.65;
      this._embers.col[i*3 + 2] = ef * 0.05;
    }
    this._embers.geo.attributes.position.needsUpdate = true;
    this._embers.geo.attributes.color.needsUpdate    = true;
    this._embers.geo.setDrawRange(0, EMBER_COUNT);
  }

  dispose() {
    for (const layer of [this._aura, this._trail, this._embers]) {
      layer.geo.dispose();
      layer.pts.material.dispose();
      if (layer.pts.parent) layer.pts.parent.remove(layer.pts);
    }
    this._fireTex.dispose();
    this._emberTex.dispose();
  }
}
