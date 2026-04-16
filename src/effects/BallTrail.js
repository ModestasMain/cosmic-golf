// ============================================================
// BallTrail.js — meteor fire trail
//
// Flaming comet tail: white-hot core fading through orange to red.
// Per-player color tints the fire so multiplayer trails are distinct.
// Tuned for up to 24 simultaneous instances.
//
// API:
//   new BallTrail(scene, color)   — color: hex number (tints the fire)
//   .setColor(hex)                — update player color live
//   .setActive(bool)              — enable/disable
//   .update(ballPos, dt)          — call every frame
//   .dispose()                    — remove from scene
// ============================================================

import {
  BufferGeometry, Float32BufferAttribute, PointsMaterial,
  Points, AdditiveBlending, Color,
} from 'three';

// ── Config ────────────────────────────────────────────────
const HISTORY     = 60;   // frames of history — shorter = tighter tail
const PER_POINT   = 8;    // ember particles per history step
const TOTAL       = HISTORY * PER_POINT;
const MAX_SCATTER = 0.7;  // max world-unit scatter at head — tight focused jet
const GLOW_COUNT  = 28;   // large soft plumes at flame head

// ── Layer builder ─────────────────────────────────────────
function buildLayer(scene, count, size, renderOrder) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('color',    new Float32BufferAttribute(new Float32Array(count * 3), 3));
  geo.setDrawRange(0, 0);

  const mat = new PointsMaterial({
    size,
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

  // Float32BufferAttribute copies the array — use the internal one for writes
  return {
    pts,
    geo,
    pos: geo.attributes.position.array,
    col: geo.attributes.color.array,
  };
}

// Deterministic hash for turbulence — no allocs
function hash(i, axis, t) {
  const v = Math.sin(i * 127.1 + axis * 311.7 + t * 1.8) * 43758.5453;
  return (v - Math.floor(v) - 0.5) * 2; // −1..+1
}

// Fire color driven by player color:
// white-hot tip → player color through middle → dark tail
// Each player gets a clearly distinct comet (blue=ice comet, red=fire, green=plasma, etc.)
function fireColor(frac, pr, pg, pb) {
  const fade      = Math.pow(frac, 0.65);
  const whiteness = Math.pow(frac, 2.5) * 0.95; // flash of white at the very tip

  return [
    Math.min(1, pr * fade + whiteness),
    Math.min(1, pg * fade + whiteness * 0.92),
    Math.min(1, pb * fade + whiteness * 0.85),
  ];
}

// ──────────────────────────────────────────────────────────

export class BallTrail {
  /**
   * @param {THREE.Scene} scene
   * @param {number} color  Player color hex — tints the fire (e.g. 0xff4400)
   */
  constructor(scene, color = 0xff6600) {
    this._history     = [];
    this._active      = false;
    this._chargeLevel = 0;
    this._t           = 0;
    this._color       = new Color(color);

    // Bright spine — tight core of the meteor
    this._core  = buildLayer(scene, HISTORY,    5.5,  92);

    // Ember scatter — turbulent fire halo
    this._cloud = buildLayer(scene, TOTAL,      3.2,  91);

    // Volumetric glow plumes — large soft particles at flame head
    this._glow  = buildLayer(scene, GLOW_COUNT, 12.0, 89);
  }

  setColor(color) {
    this._color.set(color);
  }

  setActive(active) {
    this._active = active;
    if (!active) {
      this._history = [];
      this._core.geo.setDrawRange(0, 0);
      this._cloud.geo.setDrawRange(0, 0);
      this._glow.geo.setDrawRange(0, 0);
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
        this._core.geo.setDrawRange(0, 0);
        this._cloud.geo.setDrawRange(0, 0);
        this._glow.geo.setDrawRange(0, 0);
      }
      return;
    }

    this._history.unshift({ x: ballPos.x, y: ballPos.y, z: ballPos.z });
    if (this._history.length > HISTORY) this._history.pop();
    const n = this._history.length;
    if (n < 2) {
      this._glow.geo.setDrawRange(0, 0);
      return;
    }

    const t  = this._t;
    const pr = this._color.r;
    const pg = this._color.g;
    const pb = this._color.b;

    // ── CORE SPINE ──────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const p    = this._history[i];
      const frac = 1 - i / (n - 1);

      this._core.pos[i * 3]     = p.x;
      this._core.pos[i * 3 + 1] = p.y;
      this._core.pos[i * 3 + 2] = p.z;

      const [r, g, b] = fireColor(frac, pr, pg, pb);
      this._core.col[i * 3]     = r;
      this._core.col[i * 3 + 1] = g;
      this._core.col[i * 3 + 2] = b;
    }
    this._core.geo.attributes.position.needsUpdate = true;
    this._core.geo.attributes.color.needsUpdate    = true;
    this._core.geo.setDrawRange(0, n);

    // ── EMBER SCATTER ────────────────────────────────────────
    let fi = 0;
    for (let i = 0; i < n; i++) {
      const p       = this._history[i];
      const frac    = 1 - i / (n - 1);
      const scatter = MAX_SCATTER * Math.pow(frac, 0.5);

      for (let f = 0; f < PER_POINT; f++) {
        const idx = i * PER_POINT + f;
        this._cloud.pos[fi * 3]     = p.x + hash(idx, 0, t) * scatter;
        this._cloud.pos[fi * 3 + 1] = p.y + hash(idx, 1, t) * scatter;
        this._cloud.pos[fi * 3 + 2] = p.z + hash(idx, 2, t) * scatter;

        // Embers: brighter flicker, mostly orange/yellow
        const flicker = 0.5 + 0.5 * Math.abs(Math.sin(t * 18 + idx * 3.1));
        const ef      = Math.pow(frac, 1.4) * flicker;
        const [r, g, b] = fireColor(frac * 0.85, pr, pg, pb);
        this._cloud.col[fi * 3]     = r * ef * 0.8;
        this._cloud.col[fi * 3 + 1] = g * ef * 0.8;
        this._cloud.col[fi * 3 + 2] = b * ef * 0.8;

        fi++;
      }
    }
    this._cloud.geo.attributes.position.needsUpdate = true;
    this._cloud.geo.attributes.color.needsUpdate    = true;
    this._cloud.geo.setDrawRange(0, fi);

    // ── VOLUMETRIC GLOW HEAD ────────────────────────────────────
    // Large, slowly-drifting plumes concentrated at the flame head.
    // They give the illusion of a thick volumetric fire blob at the tip.
    const headSteps = Math.min(n, 14); // only cover the first 14 history positions
    for (let i = 0; i < GLOW_COUNT; i++) {
      const hi     = Math.floor((i / GLOW_COUNT) * headSteps); // spread across head
      const p      = this._history[hi];
      const frac   = 1 - hi / Math.max(n - 1, 1);
      const spread = MAX_SCATTER * 2.2 * (1 - hi / headSteps);
      this._glow.pos[i * 3]     = p.x + hash(i * 13, 0, t * 0.28) * spread;
      this._glow.pos[i * 3 + 1] = p.y + hash(i * 13, 1, t * 0.31) * spread;
      this._glow.pos[i * 3 + 2] = p.z + hash(i * 13, 2, t * 0.25) * spread;

      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(t * 6.5 + i * 1.7));
      const gi    = frac * 0.28 * pulse;
      const [gr, gg, gb] = fireColor(frac * 0.8, pr, pg, pb);
      this._glow.col[i * 3]     = gr * gi;
      this._glow.col[i * 3 + 1] = gg * gi;
      this._glow.col[i * 3 + 2] = gb * gi;
    }
    this._glow.geo.attributes.position.needsUpdate = true;
    this._glow.geo.attributes.color.needsUpdate    = true;
    this._glow.geo.setDrawRange(0, GLOW_COUNT);
  }

  _drawChargeAura(ballPos, t, pr, pg, pb) {
    const p  = this._chargeLevel;
    const p2 = p * p;

    // Orbit radius grows with power (tight halo → expanding swirl)
    const radius = 0.6 + p2 * 2.4;

    // ── Core: swirling arc of embers orbiting the ball ───────
    const coreCount = Math.max(2, Math.floor(p * 28));
    for (let i = 0; i < coreCount; i++) {
      const phase = (i / coreCount) * Math.PI * 2;
      const spin  = t * (2.5 + p * 3.0);   // faster spin at higher power
      const angle = phase + spin;
      const elev  = Math.sin(phase * 2.3 + t * 1.1) * 0.8;
      const r     = radius * (0.7 + Math.sin(phase * 3.7 + t * 2.3) * 0.3);

      this._core.pos[i * 3]     = ballPos.x + Math.cos(angle) * Math.cos(elev) * r;
      this._core.pos[i * 3 + 1] = ballPos.y + Math.sin(elev) * r;
      this._core.pos[i * 3 + 2] = ballPos.z + Math.sin(angle) * Math.cos(elev) * r;

      const flicker = 0.5 + 0.5 * Math.abs(Math.sin(t * 13 + i * 1.9));
      const [cr, cg, cb] = fireColor(p * flicker, pr, pg, pb);
      this._core.col[i * 3]     = cr;
      this._core.col[i * 3 + 1] = cg;
      this._core.col[i * 3 + 2] = cb;
    }
    this._core.geo.attributes.position.needsUpdate = true;
    this._core.geo.attributes.color.needsUpdate    = true;
    this._core.geo.setDrawRange(0, coreCount);

    // ── Ember cloud: turbulent scatter orbiting the ball ─────
    const cloudCount = Math.floor(p2 * TOTAL * 0.45);
    for (let i = 0; i < cloudCount; i++) {
      const scatterR = radius * (0.3 + Math.abs(hash(i, 4, t * 0.4)));
      this._cloud.pos[i * 3]     = ballPos.x + hash(i, 0, t * 1.8) * scatterR;
      this._cloud.pos[i * 3 + 1] = ballPos.y + hash(i, 1, t * 2.1) * scatterR;
      this._cloud.pos[i * 3 + 2] = ballPos.z + hash(i, 2, t * 1.6) * scatterR;

      const flicker = 0.35 + 0.65 * Math.abs(Math.sin(t * 19 + i * 2.7));
      const ef = p2 * flicker * 0.75;
      const [cr, cg, cb] = fireColor(p * 0.75, pr, pg, pb);
      this._cloud.col[i * 3]     = cr * ef;
      this._cloud.col[i * 3 + 1] = cg * ef;
      this._cloud.col[i * 3 + 2] = cb * ef;
    }
    this._cloud.geo.attributes.position.needsUpdate = true;
    this._cloud.geo.attributes.color.needsUpdate    = true;
    this._cloud.geo.setDrawRange(0, cloudCount);
  }

  dispose() {
    for (const layer of [this._core, this._cloud, this._glow]) {
      layer.geo.dispose();
      layer.pts.material.dispose();
      if (layer.pts.parent) layer.pts.parent.remove(layer.pts);
    }
  }
}
