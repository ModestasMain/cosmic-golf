// ============================================================
// StarField.js — realistic galaxy star sphere
//
// Layers:
//   Main field    — 65% of stars, spectral color variation
//   Galactic band — 20% concentrated in a tilted equatorial strip
//   Star clusters — 8 dense open clusters (6%)
//   Hero stars    — 9% large glowing foreground stars
//
// Star colors follow the stellar spectral sequence:
//   O/B (hot blue) → A (blue-white) → F/G (white/yellow) → K/M (orange/red)
// ============================================================

import {
  BufferGeometry, BufferAttribute, Points, PointsMaterial,
  AdditiveBlending, Color, CanvasTexture,
} from 'three';
import { STARFIELD } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

// ── Spectral type table ───────────────────────────────────────
// [weight, r, g, b] — weights sum to 1
const SPECTRAL = [
  [0.03, 0.62, 0.72, 1.00],  // O/B — hot blue
  [0.10, 0.82, 0.90, 1.00],  // A   — blue-white
  [0.24, 1.00, 1.00, 1.00],  // F   — white
  [0.30, 1.00, 0.97, 0.80],  // G   — yellow-white (sun-like)
  [0.22, 1.00, 0.74, 0.42],  // K   — orange giant
  [0.11, 1.00, 0.38, 0.18],  // M   — red dwarf
];

function pickSpectral() {
  let r = Math.random();
  for (const [w, sr, sg, sb] of SPECTRAL) {
    r -= w;
    if (r <= 0) return [sr, sg, sb];
  }
  return SPECTRAL[SPECTRAL.length - 1].slice(1);
}

// ── Hero-star glow sprite (tight radial gradient) ─────────────
let _heroSprite = null;
function heroSprite() {
  if (_heroSprite) return _heroSprite;
  const sz  = 32;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = sz;
  const ctx  = cvs.getContext('2d');
  const half = sz / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.00, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.70, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sz, sz);
  _heroSprite = new CanvasTexture(cvs);
  return _heroSprite;
}

// ── Helper: random point on sphere of radius r ───────────────
function spherePt(r) {
  const theta = Math.acos(2 * Math.random() - 1);
  const phi   = Math.PI * 2 * Math.random();
  return [
    r * Math.sin(theta) * Math.cos(phi),
    r * Math.sin(theta) * Math.sin(phi),
    r * Math.cos(theta),
  ];
}

export class StarField {
  constructor(scene) {
    this.scene   = scene;
    this._layers = []; // { pts, geo, mat, baseClr }
    this._build();
    eventBus.on(Events.HOLE_LOADED, () => {});
  }

  _build() {
    const R  = STARFIELD.RADIUS;
    const N  = STARFIELD.COUNT;

    // Random galactic band tilt so it differs each session
    this._bandTilt = Math.random() * Math.PI;

    // ── Main star field (65%) ────────────────────────────────
    this._buildLayer(Math.floor(N * 0.65), (i, pos, clr) => {
      const [x, y, z] = spherePt(R * (0.88 + Math.random() * 0.12));
      pos[i * 3]     = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      const [sr, sg, sb] = pickSpectral();
      const b = 0.35 + Math.random() * 0.55;
      clr[i * 3]     = sr * b;
      clr[i * 3 + 1] = sg * b;
      clr[i * 3 + 2] = sb * b;
    }, 1.25, 0.88, null);

    // ── Galactic band (20%) — denser blue-white strip ─────────
    const tilt = this._bandTilt;
    this._buildLayer(Math.floor(N * 0.20), (i, pos, clr) => {
      // Concentrate near equatorial plane, then tilt the whole band
      const phi   = Math.random() * Math.PI * 2;
      const lat   = (Math.random() + Math.random() - 1) * 0.48; // gaussian, ±28°
      const r     = R * (0.86 + Math.random() * 0.14);
      const x0 = r * Math.cos(lat) * Math.cos(phi);
      const y0 = r * Math.sin(lat);
      const z0 = r * Math.cos(lat) * Math.sin(phi);
      // Rotate band around Y by tilt
      pos[i * 3]     = x0 * Math.cos(tilt) - z0 * Math.sin(tilt);
      pos[i * 3 + 1] = y0;
      pos[i * 3 + 2] = x0 * Math.sin(tilt) + z0 * Math.cos(tilt);
      // Band stars biased toward hot blue types
      const hot = Math.random() < 0.55;
      const [sr, sg, sb] = hot ? SPECTRAL[0].slice(1) : SPECTRAL[1].slice(1);
      const b = 0.22 + Math.random() * 0.32;
      clr[i * 3]     = sr * b;
      clr[i * 3 + 1] = sg * b;
      clr[i * 3 + 2] = sb * b;
    }, 1.0, 0.72, null);

    // ── Star clusters — 8 tight open clusters (6% total) ─────
    const clusterCount   = 8;
    const starsPerCluster = Math.floor(N * 0.06 / clusterCount);
    for (let c = 0; c < clusterCount; c++) {
      const [cx, cy, cz] = spherePt(R * (0.87 + Math.random() * 0.10));
      const spread        = 18 + Math.random() * 35;
      this._buildLayer(starsPerCluster, (i, pos, clr) => {
        // Gaussian-ish radial distribution inside cluster
        const d  = (Math.random() + Math.random()) * 0.5 * spread;
        const a1 = Math.random() * Math.PI * 2;
        const a2 = Math.random() * Math.PI;
        pos[i * 3]     = cx + Math.sin(a2) * Math.cos(a1) * d;
        pos[i * 3 + 1] = cy + Math.cos(a2) * d * 0.38;
        pos[i * 3 + 2] = cz + Math.sin(a2) * Math.sin(a1) * d;
        // Open clusters = young blue-white stars
        const idx = Math.random() < 0.5 ? 1 : 2; // A or F type
        const [sr, sg, sb] = SPECTRAL[idx].slice(1);
        const b = 0.55 + Math.random() * 0.45;
        clr[i * 3]     = sr * b;
        clr[i * 3 + 1] = sg * b;
        clr[i * 3 + 2] = sb * b;
      }, 1.9, 1.0, null);
    }

    // ── Hero / foreground stars (9%) — glowing, size variation ─
    const heroSpr = heroSprite();
    // Slightly closer so they stand out
    this._buildLayer(Math.floor(N * 0.09), (i, pos, clr) => {
      const [x, y, z] = spherePt(R * (0.80 + Math.random() * 0.12));
      pos[i * 3]     = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      const [sr, sg, sb] = pickSpectral();
      // Full brightness — these are the bright ones
      clr[i * 3]     = sr;
      clr[i * 3 + 1] = sg;
      clr[i * 3 + 2] = sb;
    }, 4.2, 1.0, heroSpr);
  }

  /** Build one layer and add it to the scene. */
  _buildLayer(count, fill, size, opacity, map) {
    const pos     = new Float32Array(count * 3);
    const baseClr = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) fill(i, pos, baseClr);

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));

    // Working color copy (tinted per hole)
    const clr = new Float32Array(baseClr);
    geo.setAttribute('color', new BufferAttribute(clr, 3));

    const mat = new PointsMaterial({
      size,
      map:             map ?? null,
      vertexColors:    true,
      transparent:     true,
      opacity,
      depthWrite:      false,
      blending:        AdditiveBlending,
      sizeAttenuation: true,
      alphaTest:       map ? 0.001 : 0,
    });

    const pts = new Points(geo, mat);
    this.scene.add(pts);
    this._layers.push({ pts, geo, mat, baseClr, clr });
  }

  /**
   * Tint all stars toward the palette color.
   * Applied once per hole — blends from per-star base color.
   */
  setColor(color) {
    const col = new Color(color);
    for (const { baseClr, clr, geo } of this._layers) {
      const n = clr.length / 3;
      for (let i = 0; i < n; i++) {
        // Random per-star tint amount so it doesn't look uniform
        const t = 0.06 + Math.random() * 0.14;
        const b = 0.5  + Math.random() * 0.5;
        clr[i * 3]     = baseClr[i * 3]     * b * (1 - t) + col.r * t;
        clr[i * 3 + 1] = baseClr[i * 3 + 1] * b * (1 - t) + col.g * t;
        clr[i * 3 + 2] = baseClr[i * 3 + 2] * b * (1 - t) + col.b * t;
      }
      geo.attributes.color.needsUpdate = true;
    }
  }

  dispose() {
    for (const { pts, geo, mat } of this._layers) {
      this.scene.remove(pts);
      geo.dispose();
      mat.dispose();
    }
    this._layers = [];
  }
}
