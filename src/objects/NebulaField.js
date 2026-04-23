// ============================================================
// NebulaField.js — rich galaxy background
//
// Layers (back → front):
//   1. Galactic arm   — dense arc of faint star-dust
//   2. Distant galaxies — elliptical smudges on the horizon
//   3. Emission nebulae — layered two-tone glowing clouds (7)
//   4. Gas pillars     — elongated filaments like Pillars of Creation (5)
//
// All use a soft radial-gradient canvas sprite so points look
// like volumetric blobs instead of hard squares.
// ============================================================

import {
  BufferGeometry, Float32BufferAttribute, Points, PointsMaterial,
  AdditiveBlending, Color, CanvasTexture,
} from 'three';

// ── Soft-circle sprite texture (created once, reused) ────────
let _nebulaSprite = null;
function nebulaSprite() {
  if (_nebulaSprite) return _nebulaSprite;
  const sz  = 64;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = sz;
  const ctx  = cvs.getContext('2d');
  const half = sz / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.88)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.40)');
  grad.addColorStop(0.78, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sz, sz);
  _nebulaSprite = new CanvasTexture(cvs);
  return _nebulaSprite;
}

// ── Config ────────────────────────────────────────────────────
const EMISSION_COUNT  = 10;   // glowing cloud nebulae
const PILLAR_COUNT    = 6;   // elongated gas filaments
const GALAXY_COUNT    = 7;   // distant elliptical smudges
const ARM_STARS       = 1200; // milky-way arm star dust
const ARM_RADIUS      = 2450;
const GALAXY_MIN_DIST = 2550;
const GALAXY_DIST_VAR = 1050;
const EMISSION_MIN_DIST = 1850;
const EMISSION_DIST_VAR = 1150;
const PILLAR_MIN_DIST   = 2000;
const PILLAR_DIST_VAR   = 950;

export class NebulaField {
  constructor(scene) {
    this._meshes = [];
    this._scene  = scene;
  }

  /** Rebuild every hole — matches new color palette. */
  setColors(palette) {
    for (const m of this._meshes) {
      this._scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this._meshes = [];

    const palColors = (palette.planets || [0x4488ff, 0xff44aa, 0x44ffcc])
      .map(c => new Color(c));
    const spr = nebulaSprite();

    this._buildGalacticArm(palColors, spr);
    this._buildDistantGalaxies(spr);
    this._buildEmissionNebulae(palColors, spr);
    this._buildGasPillars(palColors, spr);
  }

  // ── 1. Galactic arm — milky-way band arc in deep background ──
  _buildGalacticArm(palColors, spr) {
    const seed     = 88881;
    const count    = ARM_STARS;
    const pos      = new Float32Array(count * 3);
    const clr      = new Float32Array(count * 3);
    const arcR     = ARM_RADIUS;
    const arcStart = sr(seed) * Math.PI * 2;
    const arcLen   = Math.PI * 1.35; // ~240° sweep

    for (let i = 0; i < count; i++) {
      const t = (i / count) * arcLen + arcStart;
      // Two random samples averaged → Gaussian-ish spread
      const perp = (sr(seed + i * 4) + sr(seed + i * 4 + 1) - 1) * 320;
      const vert = (sr(seed + i * 4 + 2) - 0.5) * 160;
      const r    = arcR + perp;

      pos[i * 3]     = Math.cos(t) * r;
      pos[i * 3 + 1] = vert;
      pos[i * 3 + 2] = Math.sin(t) * r;

      // Faint blue-white with very slight palette blush
      const palC = palColors[i % palColors.length];
      const b    = 0.055 + sr(seed + i) * 0.085;
      clr[i * 3]     = (0.72 + palC.r * 0.28) * b;
      clr[i * 3 + 1] = (0.80 + palC.g * 0.20) * b;
      clr[i * 3 + 2] = (1.00)                  * b;
    }

    this._addPoints(pos, clr, 16, 0.55, spr);
  }

  // ── 2. Distant galaxies — warm elliptical smudges ────────────
  _buildDistantGalaxies(spr) {
    for (let n = 0; n < GALAXY_COUNT; n++) {
      const seed   = n * 71 + 5000;
      const angle  = (n / GALAXY_COUNT) * Math.PI * 2 + sr(seed) * 0.9;
      const dist   = GALAXY_MIN_DIST + sr(seed + 1) * GALAXY_DIST_VAR;
      const cx     = Math.cos(angle) * dist;
      const cy     = (sr(seed + 2) - 0.5) * 750;
      const cz     = Math.sin(angle) * dist;
      const tilt   = sr(seed + 3) * Math.PI;
      const radius = 50 + sr(seed + 4) * 100;
      const warm   = sr(seed + 5);

      // Old stellar population — warm yellow-orange glow
      const galR = 0.82 + warm * 0.18;
      const galG = 0.62 + warm * 0.18;
      const galB = 0.30 + (1 - warm) * 0.25;

      const count = 65;
      const pos   = new Float32Array(count * 3);
      const clr   = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        // Uniform disk sampling: sqrt for radial, flat ellipse
        const r  = Math.sqrt(sr(seed + i * 3)) * radius;
        const a  = sr(seed + i * 3 + 1) * Math.PI * 2;
        const dx = Math.cos(a) * r;
        const dz = Math.sin(a) * r * 0.28; // squash into disk

        pos[i * 3]     = cx + Math.cos(tilt) * dx - Math.sin(tilt) * dz;
        pos[i * 3 + 1] = cy + (sr(seed + i * 3 + 2) - 0.5) * radius * 0.06;
        pos[i * 3 + 2] = cz + Math.sin(tilt) * dx + Math.cos(tilt) * dz;

        // Brighter center (bulge), fading at edges
        const fade = Math.pow(1 - r / radius, 1.5) * (0.032 + sr(seed + i) * 0.035);
        clr[i * 3]     = galR * fade;
        clr[i * 3 + 1] = galG * fade;
        clr[i * 3 + 2] = galB * fade;
      }

      this._addPoints(pos, clr, 88, 0.75, spr);
    }
  }

  // ── 3. Emission nebulae — layered two-tone glowing clouds ────
  _buildEmissionNebulae(palColors, spr) {
    for (let n = 0; n < EMISSION_COUNT; n++) {
      const seed   = n * 37 + 1000;
      const angle  = (n / EMISSION_COUNT) * Math.PI * 2 + n * 0.44;
      const dist   = EMISSION_MIN_DIST + sr(seed + 10) * EMISSION_DIST_VAR;
      const cx     = Math.cos(angle) * dist;
      const cy     = (sr(seed + 11) - 0.5) * 580;
      const cz     = Math.sin(angle) * dist;
      const baseR  = 85 + sr(seed + 12) * 115;

      // Two palette colors — inner warm, outer cool (or random mix)
      const c1 = palColors[n % palColors.length].clone();
      const c2 = palColors[(n + 2) % palColors.length].clone();
      const cMid = c1.clone().lerp(c2, 0.45);

      // Three concentric layers building up the volumetric cloud look
      this._nebLayer(seed,     cx, cy, cz, baseR * 0.26, c1,   1.40, 55, 28,  spr);
      this._nebLayer(seed + 1, cx, cy, cz, baseR * 0.68, cMid, 0.65, 95, 65,  spr);
      this._nebLayer(seed + 2, cx, cy, cz, baseR * 1.55, c2,   0.22, 65, 110, spr);
    }
  }

  /** One concentric layer of a nebula cloud. */
  _nebLayer(seed, cx, cy, cz, radius, color, bright, count, ptSize, spr) {
    const pos = new Float32Array(count * 3);
    const clr = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // pow(rand, 0.55) clusters more points toward the center
      const r  = Math.pow(sr(seed + i * 5), 0.55) * radius;
      const a1 = sr(seed + i * 5 + 1) * Math.PI * 2;
      const a2 = sr(seed + i * 5 + 2) * Math.PI;

      pos[i * 3]     = cx + Math.sin(a2) * Math.cos(a1) * r;
      pos[i * 3 + 1] = cy + Math.cos(a2) * r * 0.36; // flatten into disk
      pos[i * 3 + 2] = cz + Math.sin(a2) * Math.sin(a1) * r;

      const b = bright * (0.55 + sr(seed + i * 3 + 3) * 0.45);
      clr[i * 3]     = color.r * b;
      clr[i * 3 + 1] = color.g * b;
      clr[i * 3 + 2] = color.b * b;
    }

    this._addPoints(pos, clr, ptSize, 0.88, spr);
  }

  // ── 4. Gas pillars — elongated filaments ─────────────────────
  _buildGasPillars(palColors, spr) {
    for (let n = 0; n < PILLAR_COUNT; n++) {
      const seed       = n * 53 + 3000;
      const angle      = sr(seed) * Math.PI * 2;
      const dist       = PILLAR_MIN_DIST + sr(seed + 1) * PILLAR_DIST_VAR;
      const cx         = Math.cos(angle) * dist;
      const cy         = (sr(seed + 2) - 0.5) * 500;
      const cz         = Math.sin(angle) * dist;
      const spineAngle = sr(seed + 3) * Math.PI * 2;
      const length     = 200 + sr(seed + 4) * 220;
      const width      = 20 + sr(seed + 5) * 30;
      const color      = palColors[(n + 3) % palColors.length].clone();

      const count = 85;
      const pos   = new Float32Array(count * 3);
      const clr   = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        // t: -1..1 along the pillar spine
        const t    = sr(seed + i * 6) * 2 - 1;
        const w    = sr(seed + i * 6 + 1) * width;
        const wAng = sr(seed + i * 6 + 2) * Math.PI * 2;

        pos[i * 3]     = cx + Math.cos(spineAngle) * t * length * 0.5 + Math.cos(wAng) * w;
        pos[i * 3 + 1] = cy + (sr(seed + i * 6 + 3) - 0.5) * width * 0.35;
        pos[i * 3 + 2] = cz + Math.sin(spineAngle) * t * length * 0.5 + Math.sin(wAng) * w;

        // Bright center, fade toward tips
        const edgeFade = Math.pow(1 - Math.abs(t), 0.6);
        const b = edgeFade * (0.30 + sr(seed + i) * 0.38);
        clr[i * 3]     = color.r * b;
        clr[i * 3 + 1] = color.g * b;
        clr[i * 3 + 2] = color.b * b;
      }

      this._addPoints(pos, clr, 50, 0.82, spr);
    }
  }

  // ── Shared: create and add a Points object to the scene ──────
  _addPoints(pos, clr, size, opacity, map) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color',    new Float32BufferAttribute(clr, 3));

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

    const mesh = new Points(geo, mat);
    mesh.renderOrder = 1;
    this._scene.add(mesh);
    this._meshes.push(mesh);
  }

  dispose() {
    for (const m of this._meshes) {
      this._scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this._meshes = [];
  }
}

// ── Fast seeded deterministic random ─────────────────────────
function sr(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = ((n + (n << 3)) >>> 0);
  n ^= n >>> 4;
  n = (Math.imul(n, 0x27d4eb2d) >>> 0);
  n ^= n >>> 15;
  return (n >>> 0) / 0xffffffff;
}
