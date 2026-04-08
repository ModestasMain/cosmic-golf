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
const HISTORY     = 45;   // frames of history — shorter = tighter tail
const PER_POINT   = 5;    // ember particles per history step
const TOTAL       = HISTORY * PER_POINT;
const MAX_SCATTER = 1.6;  // max world-unit scatter at head

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

// Fire color at a given frac (1=head, 0=tail), tinted by player color
// white-hot → yellow → orange → red → black
function fireColor(frac, pr, pg, pb) {
  // White core at very tip
  if (frac > 0.92) {
    const t = (frac - 0.92) / 0.08;
    return [
      1,
      1 - (1 - Math.max(pg, 0.9)) * t,
      1 - (1 - Math.max(pb, 0.7)) * t,
    ];
  }
  // Yellow → orange band
  if (frac > 0.55) {
    const t = (frac - 0.55) / 0.37;
    return [
      Math.min(1, 0.9 + pr * 0.1),
      Math.min(1, (0.25 + t * 0.65) * Math.max(pg, 0.4)),
      pb * (1 - t) * 0.15,
    ];
  }
  // Orange → deep red
  const t   = Math.pow(frac / 0.55, 0.7);
  const dim = Math.pow(frac / 0.55, 1.4);
  return [
    Math.min(1, pr * 0.9 + 0.6) * dim,
    Math.min(1, pg * 0.3 + 0.05) * dim,
    pb * 0.05 * dim,
  ];
}

// ──────────────────────────────────────────────────────────

export class BallTrail {
  /**
   * @param {THREE.Scene} scene
   * @param {number} color  Player color hex — tints the fire (e.g. 0xff4400)
   */
  constructor(scene, color = 0xff6600) {
    this._history = [];
    this._active  = false;
    this._t       = 0;
    this._color   = new Color(color);

    // Bright spine — tight core of the meteor
    this._core  = buildLayer(scene, HISTORY, 2.2, 91);

    // Ember scatter — turbulent fire halo
    this._cloud = buildLayer(scene, TOTAL,   1.3, 90);
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
    }
  }

  update(ballPos, dt = 0.016) {
    this._t += dt;

    if (!this._active) {
      this._core.geo.setDrawRange(0, 0);
      this._cloud.geo.setDrawRange(0, 0);
      return;
    }

    this._history.unshift({ x: ballPos.x, y: ballPos.y, z: ballPos.z });
    if (this._history.length > HISTORY) this._history.pop();
    const n = this._history.length;
    if (n < 2) return;

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
  }

  dispose() {
    for (const layer of [this._core, this._cloud]) {
      layer.geo.dispose();
      layer.pts.material.dispose();
      if (layer.pts.parent) layer.pts.parent.remove(layer.pts);
    }
  }
}
