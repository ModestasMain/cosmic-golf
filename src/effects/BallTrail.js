// ============================================================
// BallTrail.js — realistic comet trail
//
// Four additive layers:
//   1. Core spine    — tight bright thread along the path
//   2. Nebula cloud  — wide soft gas plume, scatter ⊥ to velocity
//   3. Spark scatter — bright individual embers drifting outward
//   4. Glow head     — large volumetric bloom at ball position
// ============================================================

import {
  BufferGeometry, Float32BufferAttribute, PointsMaterial,
  Points, AdditiveBlending, Color, Vector3, CanvasTexture,
} from 'three';
import { BALL } from '../core/Constants.js';

const BALL_RADIUS = BALL.RADIUS;

// ── Config ────────────────────────────────────────────────
const HISTORY       = 80;   // trail length in frames
const NEBULA_COUNT  = 480;  // dense soft cloud — ~6 per history step for smooth mist
const SPARK_COUNT   = 180;  // individual bright embers
const GLOW_COUNT    = 20;   // tight head bloom

const CORE_SCATTER  = 0.4;  // tight spine width
const NEBULA_SCATTER= 3.0;  // gas cloud half-width at widest point
const SPARK_SCATTER = 2.8;  // spark drift radius

let GLOBAL_QUALITY = {
  density: 1,
  sizeScale: 1,
  opacityScale: 1,
};

// ── Soft circular sprite ──────────────────────────────────
function makeSprite(innerStop = 0.0, outerStop = 1.0) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(innerStop, 'rgba(255,255,255,1)');
  grad.addColorStop(outerStop, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}

const _spriteCore   = makeSprite(0.0, 0.45);
const _spriteNebula = makeSprite(0.0, 1.0);
const _spriteSpark  = makeSprite(0.0, 0.3);

// ── Helpers ───────────────────────────────────────────────
function buildLayer(scene, count, size, renderOrder, sprite) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('color',    new Float32BufferAttribute(new Float32Array(count * 3), 3));
  geo.setDrawRange(0, 0);

  const mat = new PointsMaterial({
    size,
    map:             sprite,
    alphaTest:       0.001,
    vertexColors:    true,
    transparent:     true,
    opacity:         1.0,
    depthWrite:      false,
    depthTest:       false,
    blending:        AdditiveBlending,
    sizeAttenuation: true,
  });

  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder   = renderOrder;
  scene.add(pts);

  return {
    pts, geo, mat,
    baseSize: size,
    pos: geo.attributes.position.array,
    col: geo.attributes.color.array,
  };
}

function hash(i, axis, t) {
  const v = Math.sin(i * 127.1 + axis * 311.7 + t * 1.8) * 43758.5453;
  return (v - Math.floor(v) - 0.5) * 2; // −1..+1
}

// White-hot head → player color middle → dark tail
function fireColor(frac, pr, pg, pb) {
  const fade      = Math.pow(frac, 0.6);
  const whiteness = Math.pow(frac, 2.2) * 1.0;
  return [
    Math.min(1, pr * fade + whiteness),
    Math.min(1, pg * fade + whiteness * 0.90),
    Math.min(1, pb * fade + whiteness * 0.80),
  ];
}

// Build two axes perpendicular to a direction vector
const _up    = new Vector3(0, 1, 0);
const _right = new Vector3(1, 0, 0);
const _perp1 = new Vector3();
const _perp2 = new Vector3();
function buildPerp(dir) {
  const ref = Math.abs(dir.dot(_up)) < 0.9 ? _up : _right;
  _perp1.crossVectors(dir, ref).normalize();
  _perp2.crossVectors(dir, _perp1).normalize();
}

// ──────────────────────────────────────────────────────────

export class BallTrail {
  static setGlobalQuality(q = {}) {
    GLOBAL_QUALITY = {
      density: Math.max(0.18, Math.min(1, q.density ?? 1)),
      sizeScale: Math.max(0.45, q.sizeScale ?? 1),
      opacityScale: Math.max(0.35, q.opacityScale ?? 1),
    };
  }

  constructor(scene, color = 0xff6600) {
    this._history     = [];
    this._active      = false;
    this._chargeLevel = 0;
    this._t           = 0;
    this._color       = new Color(color);
    this._vel         = new Vector3();

    // Layer order (back → front): nebula, sparks, core, glow head
    this._nebula = buildLayer(scene, NEBULA_COUNT,  4.5, 88, _spriteNebula);
    this._sparks = buildLayer(scene, SPARK_COUNT,   2.5, 90, _spriteSpark);
    this._core   = buildLayer(scene, HISTORY,        4.5, 92, _spriteCore);
    this._glow   = buildLayer(scene, GLOW_COUNT,     8.0, 89, _spriteNebula);
    this.setQuality(GLOBAL_QUALITY);
  }

  setColor(color) { this._color.set(color); }

  setQuality(q = GLOBAL_QUALITY) {
    this._quality = {
      density: Math.max(0.18, Math.min(1, q.density ?? 1)),
      sizeScale: Math.max(0.45, q.sizeScale ?? 1),
      opacityScale: Math.max(0.35, q.opacityScale ?? 1),
    };
    for (const layer of [this._core, this._nebula, this._sparks, this._glow]) {
      layer.mat.size = layer.baseSize * this._quality.sizeScale;
      layer.mat.opacity = this._quality.opacityScale;
    }
  }

  setActive(active) {
    this._active = active;
    if (!active) {
      this._history = [];
      for (const l of [this._core, this._nebula, this._sparks, this._glow])
        l.geo.setDrawRange(0, 0);
    }
  }

  setChargeLevel(p) {
    this._chargeLevel = Math.max(0, Math.min(1, p));
  }

  update(ballPos, dt = 0.016) {
    this._t += dt;

    if (!this._active) {
      if (this._chargeLevel > 0.05) {
        this._drawChargeAura(ballPos, this._t, this._color.r, this._color.g, this._color.b);
      } else {
        for (const l of [this._core, this._nebula, this._sparks, this._glow])
          l.geo.setDrawRange(0, 0);
      }
      return;
    }

    this._history.unshift({ x: ballPos.x, y: ballPos.y, z: ballPos.z });
    if (this._history.length > HISTORY) this._history.pop();
    const n = this._history.length;
    if (n < 2) { this._glow.geo.setDrawRange(0, 0); return; }
    const density = this._quality?.density ?? 1;

    const t  = this._t;
    const pr = this._color.r;
    const pg = this._color.g;
    const pb = this._color.b;

    // Velocity direction from last two positions → perpendicular axes for spread
    const h0 = this._history[0], h1 = this._history[1];
    this._vel.set(h0.x - h1.x, h0.y - h1.y, h0.z - h1.z);
    const speed = this._vel.length();
    if (speed > 0.001) this._vel.divideScalar(speed);
    buildPerp(this._vel);

    // ── CORE SPINE ──────────────────────────────────────────
    const coreCount = Math.max(2, Math.floor(n * density));
    for (let i = 0; i < coreCount; i++) {
      const p    = this._history[i];
      const frac = 1 - i / Math.max(coreCount - 1, 1);
      const sc   = CORE_SCATTER * frac;

      this._core.pos[i * 3]     = p.x + hash(i, 0, t) * sc;
      this._core.pos[i * 3 + 1] = p.y + hash(i, 1, t) * sc;
      this._core.pos[i * 3 + 2] = p.z + hash(i, 2, t) * sc;

      const [r, g, b] = fireColor(frac, pr, pg, pb);
      const bright = frac * frac; // extra brightness falloff toward tail
      this._core.col[i * 3]     = r * bright;
      this._core.col[i * 3 + 1] = g * bright;
      this._core.col[i * 3 + 2] = b * bright;
    }
    this._core.geo.attributes.position.needsUpdate = true;
    this._core.geo.attributes.color.needsUpdate    = true;
    this._core.geo.setDrawRange(0, coreCount);

    // ── NEBULA CLOUD ─────────────────────────────────────────
    // Dense mist: start from history[1] so ball stays visible.
    // Narrow near head, peaks in width at ~30% of tail, tapers at end.
    const nebulaStart = 1; // skip index 0 (ball position)
    const nebulaSpan  = n - nebulaStart;
    const nebulaCount = Math.max(48, Math.floor(NEBULA_COUNT * density));
    for (let i = 0; i < nebulaCount; i++) {
      const hi   = nebulaStart + Math.floor((i / nebulaCount) * nebulaSpan);
      const p    = this._history[Math.min(hi, n - 1)];
      // t01: 0 at head, 1 at tail
      const t01  = (hi - nebulaStart) / Math.max(nebulaSpan - 1, 1);
      // Bell-ish envelope: zero at head, peak ~35% back, taper to tail
      const envelope = Math.sin(t01 * Math.PI) * (0.4 + t01 * 0.6);
      const spreadScale = NEBULA_SCATTER * envelope;

      const a1 = hash(i, 3, t * 0.15) * spreadScale;
      const a2 = hash(i, 4, t * 0.17) * spreadScale * 0.7;
      const a3 = hash(i, 5, t * 0.08) * spreadScale * 0.2; // minor parallel drift

      this._nebula.pos[i * 3]     = p.x + _perp1.x * a1 + _perp2.x * a2 + this._vel.x * a3;
      this._nebula.pos[i * 3 + 1] = p.y + _perp1.y * a1 + _perp2.y * a2 + this._vel.y * a3;
      this._nebula.pos[i * 3 + 2] = p.z + _perp1.z * a1 + _perp2.z * a2 + this._vel.z * a3;

      const frac = 1 - t01;
      const pulse = 0.5 + 0.25 * Math.abs(Math.sin(t * 1.8 + i * 0.37));
      const ni = Math.pow(frac, 0.5) * 0.22 * pulse;
      const [r, g, b] = fireColor(frac * 0.75, pr, pg, pb);
      this._nebula.col[i * 3]     = r * ni;
      this._nebula.col[i * 3 + 1] = g * ni;
      this._nebula.col[i * 3 + 2] = b * ni;
    }
    this._nebula.geo.attributes.position.needsUpdate = true;
    this._nebula.geo.attributes.color.needsUpdate    = true;
    this._nebula.geo.setDrawRange(0, nebulaCount);

    // ── SPARK SCATTER ────────────────────────────────────────
    // Bright individual embers that drift away from the spine
    const sparkCount = Math.max(24, Math.floor(SPARK_COUNT * density));
    for (let i = 0; i < sparkCount; i++) {
      const hi   = Math.floor((i / sparkCount) * n);
      const p    = this._history[hi];
      const frac = 1 - hi / (n - 1);

      // Random scatter in all directions but biased ⊥ to velocity
      const sc   = SPARK_SCATTER * Math.pow(1 - frac, 0.4);
      const sx   = hash(i * 3,     0, t * 0.55) * sc;
      const sy   = hash(i * 3,     1, t * 0.48) * sc;
      const sz   = hash(i * 3,     2, t * 0.51) * sc;

      this._sparks.pos[i * 3]     = p.x + sx;
      this._sparks.pos[i * 3 + 1] = p.y + sy;
      this._sparks.pos[i * 3 + 2] = p.z + sz;

      const flicker = 0.3 + 0.7 * Math.abs(Math.sin(t * 22 + i * 2.9));
      const sf      = Math.pow(frac, 1.8) * flicker;
      const [r, g, b] = fireColor(frac * 0.9, pr, pg, pb);
      this._sparks.col[i * 3]     = r * sf * 0.9;
      this._sparks.col[i * 3 + 1] = g * sf * 0.9;
      this._sparks.col[i * 3 + 2] = b * sf * 0.9;
    }
    this._sparks.geo.attributes.position.needsUpdate = true;
    this._sparks.geo.attributes.color.needsUpdate    = true;
    this._sparks.geo.setDrawRange(0, sparkCount);

    // ── VOLUMETRIC GLOW HEAD ─────────────────────────────────
    // Tight bright bloom just behind the ball (skip index 0)
    const headSteps = Math.min(n - 1, 8);
    const glowCount = Math.max(6, Math.floor(GLOW_COUNT * density));
    for (let i = 0; i < glowCount; i++) {
      const hi   = 1 + Math.floor((i / glowCount) * headSteps);
      const p    = this._history[Math.min(hi, n - 1)];
      const frac = 1 - (hi - 1) / Math.max(headSteps - 1, 1);
      const spread = 1.2 * frac;

      this._glow.pos[i * 3]     = p.x + hash(i * 11, 0, t * 0.3) * spread;
      this._glow.pos[i * 3 + 1] = p.y + hash(i * 11, 1, t * 0.33) * spread;
      this._glow.pos[i * 3 + 2] = p.z + hash(i * 11, 2, t * 0.28) * spread;

      const pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * 7.0 + i * 1.7));
      const gi    = frac * 0.55 * pulse;
      const [r, g, b] = fireColor(frac * 0.85, pr, pg, pb);
      this._glow.col[i * 3]     = r * gi;
      this._glow.col[i * 3 + 1] = g * gi;
      this._glow.col[i * 3 + 2] = b * gi;
    }
    this._glow.geo.attributes.position.needsUpdate = true;
    this._glow.geo.attributes.color.needsUpdate    = true;
    this._glow.geo.setDrawRange(0, glowCount);
  }

  _drawChargeAura(_ballPos, _t, _pr, _pg, _pb) {
    for (const l of [this._core, this._nebula, this._sparks, this._glow])
      l.geo.setDrawRange(0, 0);
  }

  dispose() {
    for (const layer of [this._core, this._nebula, this._sparks, this._glow]) {
      layer.geo.dispose();
      layer.pts.material.dispose();
      if (layer.pts.parent) layer.pts.parent.remove(layer.pts);
    }
  }
}
