// ============================================================
// NebulaField.js — soft background nebula clouds
// Big additive-blended point sprites scattered in deep space.
// Gives depth and "alive universe" feel without hurting FPS.
// ============================================================

import {
  BufferGeometry, Float32BufferAttribute, Points, PointsMaterial,
  AdditiveBlending, Color,
} from 'three';

const CLOUD_COUNT  = 120;  // billboards per nebula
const NEBULA_COUNT = 4;    // distinct cloud clusters

export class NebulaField {
  constructor(scene) {
    this._meshes = [];
    this._scene  = scene;
    // Built lazily when palette is first set
    this._built  = false;
  }

  /** Call once per hole with the palette so colors match the theme. */
  setColors(palette) {
    // Dispose old
    for (const m of this._meshes) {
      this._scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this._meshes = [];

    const colors = palette.planets || [0x4444ff, 0xff44aa, 0x44ffcc];

    for (let n = 0; n < NEBULA_COUNT; n++) {
      const col  = new Color(colors[n % colors.length]);
      const seed = n * 7919;

      const pos  = new Float32Array(CLOUD_COUNT * 3);
      const clr  = new Float32Array(CLOUD_COUNT * 3);

      // Nebula centre — scattered far in the background
      const cx = Math.cos(n * 1.5) * 600;
      const cy = (n % 2 === 0 ? 1 : -1) * (150 + n * 80);
      const cz = Math.sin(n * 1.5) * 600;

      for (let i = 0; i < CLOUD_COUNT; i++) {
        const r  = seededRand(seed + i * 3)     * 180;
        const a1 = seededRand(seed + i * 3 + 1) * Math.PI * 2;
        const a2 = seededRand(seed + i * 3 + 2) * Math.PI * 2;

        pos[i * 3]     = cx + Math.cos(a1) * Math.cos(a2) * r;
        pos[i * 3 + 1] = cy + Math.sin(a2) * r * 0.4; // flattened vertically
        pos[i * 3 + 2] = cz + Math.sin(a1) * Math.cos(a2) * r;

        const brightness = 0.15 + seededRand(seed + i) * 0.25;
        clr[i * 3]     = col.r * brightness;
        clr[i * 3 + 1] = col.g * brightness;
        clr[i * 3 + 2] = col.b * brightness;
      }

      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geo.setAttribute('color',    new Float32BufferAttribute(clr, 3));

      const mat = new PointsMaterial({
        size:            28,
        vertexColors:    true,
        transparent:     true,
        opacity:         0.55,
        depthWrite:      false,
        blending:        AdditiveBlending,
        sizeAttenuation: true,
      });

      const mesh = new Points(geo, mat);
      mesh.renderOrder = 1; // behind everything
      this._scene.add(mesh);
      this._meshes.push(mesh);
    }
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

// Fast deterministic rand — no state needed
function seededRand(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) >>> 0;
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d) >>> 0;
  n ^= n >>> 15;
  return (n >>> 0) / 0xffffffff;
}
