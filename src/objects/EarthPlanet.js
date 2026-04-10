/*// ============================================================
// EarthPlanet.js — lush Earth-like planet for visual testing
// MeshBasicMaterial throughout — no dark-side shading issues.
// Water texture is noise-matched so blue only covers ocean areas.
// Same interface as Planet.js (addToScene, update, setOpacity…)
// ============================================================

import {
  Mesh, SphereGeometry, MeshBasicMaterial,
  Group, BackSide, Color, AdditiveBlending, CanvasTexture,
} from 'three';
import { GravityField } from '../effects/GravityField.js';

const R = 512;

// ── Noise — same function drives texture pixels AND vegetation ─
// Returns roughly -0.5 … +0.5 for any unit-vector input.

function earthNoise(nx, ny, nz, seed) {
  const s = seed * 0.0013;
  return (
    Math.sin(nx * 1.8 + s)       * Math.cos(ny * 1.5 + s * 1.3) +
    Math.sin(ny * 2.1 + s * 0.7) * Math.cos(nz * 1.9 + s * 2.1) +
    Math.sin(nz * 2.4 + s * 1.5) * Math.cos(nx * 2.7 + s * 0.5)
  ) / 3;
}

const LAND_THRESHOLD = 0.05;
function isLand(nx, ny, nz, seed) {
  return earthNoise(nx, ny, nz, seed) > LAND_THRESHOLD;
}
function isPolar(_ny) { return false; } // no polar caps

// ── Surface texture ───────────────────────────────────────────

function makeEarthTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = R;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(R, R);
  const px  = img.data;

  for (let py = 0; py < R; py++) {
    const lat    = (py / R - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let ix = 0; ix < R; ix++) {
      const lon = (ix / R) * Math.PI * 2 - Math.PI;
      const nx  = cosLat * Math.cos(lon);
      const ny  = sinLat;
      const nz  = cosLat * Math.sin(lon);
      const i   = (py * R + ix) * 4;
      px[i+3]   = 255;

      {
        const noise = earthNoise(nx, ny, nz, seed);
        if (noise > LAND_THRESHOLD) {
          const v = Math.min(1, (noise - LAND_THRESHOLD) / 0.6);
          if (v < 0.08) {
            // Sandy beach
            px[i] = 220; px[i+1] = 205; px[i+2] = 150;
          } else if (v < 0.55) {
            // Green land — brighter so it reads well without lighting
            const g = 0.55 - v;
            px[i]   = Math.round(50  + g * 80);
            px[i+1] = Math.round(150 + g * 50);
            px[i+2] = Math.round(40  + g * 20);
          } else {
            // Rocky highlands
            const h = (v - 0.55) / 0.45;
            px[i]   = Math.round(140 + h * 60);
            px[i+1] = Math.round(125 + h * 50);
            px[i+2] = Math.round(100 + h * 40);
          }
        } else {
          // Ocean — bright readable blue
          const depth = Math.min(1, (LAND_THRESHOLD - noise) / 0.8);
          px[i]   = 20;
          px[i+1] = Math.round(80  + depth * 50);
          px[i+2] = Math.round(190 + depth * 60);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return new CanvasTexture(canvas);
}

// ── Water overlay texture ─────────────────────────────────────
// Blue + semi-transparent where ocean, fully transparent where land.
// Parented to this.mesh so it co-rotates and stays perfectly aligned.

function makeWaterTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = R;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(R, R);
  const px  = img.data;

  for (let py = 0; py < R; py++) {
    const lat    = (py / R - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let ix = 0; ix < R; ix++) {
      const lon = (ix / R) * Math.PI * 2 - Math.PI;
      const nx  = cosLat * Math.cos(lon);
      const ny  = sinLat;
      const nz  = cosLat * Math.sin(lon);
      const i   = (py * R + ix) * 4;

      if (!isPolar(ny) && !isLand(nx, ny, nz, seed)) {
        const depth = Math.min(1, (LAND_THRESHOLD - earthNoise(nx, ny, nz, seed)) / 0.8);
        px[i]   = 15;
        px[i+1] = Math.round(100 + depth * 40);
        px[i+2] = Math.round(210 + depth * 45);
        px[i+3] = 190; // semi-transparent
      }
      // land / polar: alpha stays 0
    }
  }
  ctx.putImageData(img, 0, 0);
  return new CanvasTexture(canvas);
}

// ── EarthPlanet ───────────────────────────────────────────────

export class EarthPlanet {
  constructor({ position, radius = 16, mass = 2000, seed = 42 }) {
    this.position = position;
    this.radius   = radius;
    this.mass     = mass;

    this._textures  = [];
    this._spinSpeed = 0.04;
    this._waterTime = 0;

    this.group     = new Group();
    this.group.position.copy(position);
    this.bodyGroup = new Group();
    this.group.add(this.bodyGroup);

    // Build order matters: surface first so this.mesh exists for children
    this._buildSurface(seed);
    this._buildWater(seed);
    this._buildAtmosphere();

    this.gravityField = new GravityField(position, radius, mass, 0x4488ff);
  }

  _buildSurface(seed) {
    const geo     = new SphereGeometry(this.radius, 48, 32);
    const texture = makeEarthTexture(seed);
    this._textures.push(texture);

    // MeshBasicMaterial — full-brightness regardless of scene lighting
    this._matOpaque = new MeshBasicMaterial({ map: texture });
    this._matTransparent = new MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, opacity: 0.3,
    });
    this.mesh = new Mesh(geo, this._matOpaque);
    this.bodyGroup.add(this.mesh);
  }

  _buildWater(seed) {
    // Slightly larger sphere, noise-matched texture so water only shows on ocean.
    // Parented to this.mesh so it rotates with the surface — no drift/misalign.
    const geo = new SphereGeometry(this.radius * 1.012, 40, 26);
    const tex = makeWaterTexture(seed);
    this._textures.push(tex);
    this._waterMat  = new MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, alphaTest: 0.01,
    });
    this._waterMesh = new Mesh(geo, this._waterMat);
    this.mesh.add(this._waterMesh); // child of mesh — co-rotates
  }


  _buildAtmosphere() {
    const geo = new SphereGeometry(this.radius * 1.16, 24, 18);
    const mat = new MeshBasicMaterial({
      color: new Color(0x55aaff), side: BackSide,
      transparent: true, opacity: 0.08,
      depthWrite: false, blending: AdditiveBlending,
    });
    this.bodyGroup.add(new Mesh(geo, mat));
  }

  // ── Planet interface ──────────────────────────────────────

  setOpacity(v) {
    if (v >= 0.99) {
      this.mesh.material = this._matOpaque;
    } else {
      this._matTransparent.opacity = v;
      this.mesh.material = this._matTransparent;
    }
  }

  addCrater(_pos, _speed) {} // stub — ball can bounce without crashing

  update(dt) {
    this.mesh.rotation.y += this._spinSpeed * dt;
    // Subtle water shimmer via opacity pulse
    this._waterTime += dt;
    this._waterMat.opacity = 0.88 + Math.sin(this._waterTime * 0.8) * 0.08;
    this.gravityField.update(dt);
  }

  addToScene(scene) {
    scene.add(this.group);
    this.gravityField.addToScene(scene);
  }

  removeFromScene(scene) {
    scene.remove(this.group);
    this.gravityField.removeFromScene(scene);
    this.dispose();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this._matOpaque.dispose();
    this._matTransparent.dispose();
    this._waterMesh.geometry.dispose();
    this._waterMat.dispose();
    for (const t of this._textures) t.dispose();
  }
}
  */
