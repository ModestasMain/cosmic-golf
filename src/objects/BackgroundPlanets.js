// ============================================================
// BackgroundPlanets.js — unreachable deep-space planet decor
// Visual only: no physics, no collisions, not part of hole planets.
// ============================================================

import {
  Group, Mesh, SphereGeometry, RingGeometry, MeshBasicMaterial,
  CanvasTexture, Color, DoubleSide, AdditiveBlending,
} from 'three';
import { BACKDROP_PLANETS } from '../core/Constants.js';

function makePlanetTexture(seed, base, accent) {
  const size = 256;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, base.clone().multiplyScalar(1.25).getStyle());
  grd.addColorStop(0.52, base.getStyle());
  grd.addColorStop(1, base.clone().multiplyScalar(0.38).getStyle());
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 18; i++) {
    const y = ((i * 37 + seed * 19) % size);
    const h = 4 + ((i * 13 + seed) % 18);
    const a = 0.06 + ((i * 7 + seed) % 9) * 0.012;
    ctx.fillStyle = accent.clone().multiplyScalar(0.8 + (i % 3) * 0.25).getStyle();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.ellipse(size * 0.5, y, size * (0.34 + (i % 4) * 0.07), h, (i + seed) * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.42;
  const shade = ctx.createRadialGradient(size * 0.32, size * 0.25, 8, size * 0.74, size * 0.76, size * 0.86);
  shade.addColorStop(0, 'rgba(255,255,255,0.20)');
  shade.addColorStop(0.55, 'rgba(120,120,160,0.32)');
  shade.addColorStop(1, 'rgba(0,0,10,0.92)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  const tex = new CanvasTexture(cvs);
  tex.colorSpace = 'srgb';
  return tex;
}

function makeGlowTexture(color) {
  const size = 192;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, color.clone().multiplyScalar(1.25).getStyle());
  g.addColorStop(0.32, color.getStyle());
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(cvs);
  tex.colorSpace = 'srgb';
  return tex;
}

const PALETTE = [
  [0x4e9dff, 0x9fe8ff],
  [0xf6a83f, 0xfff0a8],
  [0xd94b54, 0xffa87a],
  [0x7ee6cc, 0xb8fff0],
  [0xb28cff, 0xffb6f3],
  [0xcfd7e8, 0xffffff],
];

export class BackgroundPlanets {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.name = 'BackgroundPlanets';
    this._items = [];
    this._textures = [];
    this._enabled = BACKDROP_PLANETS.ENABLED;
    this.group.visible = this._enabled;
    this.scene.add(this.group);
    this._build();
  }

  _build() {
    const geo = new SphereGeometry(1, 48, 24);
    for (let i = 0; i < BACKDROP_PLANETS.COUNT; i++) {
      const [baseHex, accentHex] = PALETTE[i % PALETTE.length];
      const base = new Color(baseHex);
      const accent = new Color(accentHex);
      const tex = makePlanetTexture(i + 3, base, accent);
      this._textures.push(tex);

      const mat = new MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: BACKDROP_PLANETS.OPACITY,
        depthWrite: false,
      });
      const mesh = new Mesh(geo, mat);
      const sizeT = (i * 47 % 100) / 100;
      const scale = BACKDROP_PLANETS.MIN_SIZE + sizeT * (BACKDROP_PLANETS.MAX_SIZE - BACKDROP_PLANETS.MIN_SIZE);
      mesh.scale.setScalar(scale);

      const angle = (i / BACKDROP_PLANETS.COUNT) * Math.PI * 2 + (i % 3) * 0.34;
      const elev = [-0.52, 0.42, -0.08, 0.68, -0.36, 0.18, 0.56, -0.62, 0.05][i % 9];
      const r = BACKDROP_PLANETS.RADIUS * (0.84 + ((i * 29) % 17) / 100);
      mesh.position.set(
        Math.cos(angle) * Math.cos(elev) * r,
        Math.sin(elev) * r,
        Math.sin(angle) * Math.cos(elev) * r,
      );
      mesh.rotation.set(i * 0.38, i * 0.71, i * 0.19);
      mesh.renderOrder = -20;
      this.group.add(mesh);

      if (i === 1 || i === 5 || i === 7) {
        this._addRing(mesh, scale, accent);
      }

      if (i === 0 || i === 3) {
        this._addHalo(mesh, scale, accent);
      }

      this._items.push({ mesh, spin: 0.003 + i * 0.0005 });
    }
  }

  _addRing(parent, scale, color) {
    const ringGeo = new RingGeometry(1.28, 1.78, 96);
    const ringMat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      side: DoubleSide,
      depthWrite: false,
    });
    const ring = new Mesh(ringGeo, ringMat);
    ring.scale.setScalar(1);
    ring.rotation.set(Math.PI * 0.56, 0.2, -0.42);
    ring.renderOrder = -19;
    parent.add(ring);
  }

  _addHalo(parent, scale, color) {
    const tex = makeGlowTexture(color);
    this._textures.push(tex);
    const haloGeo = new SphereGeometry(1.08, 32, 16);
    const haloMat = new MeshBasicMaterial({
      map: tex,
      color,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const halo = new Mesh(haloGeo, haloMat);
    halo.scale.setScalar(1);
    halo.renderOrder = -21;
    parent.add(halo);
  }

  update(dt, camera) {
    if (!this._enabled) return;
    if (camera) this.group.position.copy(camera.position).multiplyScalar(BACKDROP_PLANETS.FOLLOW_CAMERA);
    for (const item of this._items) item.mesh.rotation.y += dt * item.spin;
  }

  setQuality({ visible = true } = {}) {
    this._enabled = visible && BACKDROP_PLANETS.ENABLED;
    this.group.visible = this._enabled;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    for (const tex of this._textures) tex.dispose();
  }
}
