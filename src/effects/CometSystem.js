// ============================================================
// CometSystem.js — rare background comets streaking across space
//
// Every 15–40 seconds a comet spawns on the far background sphere,
// travels in a straight line, and fades out before it exits.
// Each comet has a bright head + fading particle trail.
// ============================================================

import {
  BufferGeometry, Float32BufferAttribute,
  Points, PointsMaterial, AdditiveBlending,
  Vector3, Color, CanvasTexture,
} from 'three';

// ── Soft-glow sprite (created once) ──────────────────────────
let _sprite = null;
function glowSprite() {
  if (_sprite) return _sprite;
  const sz  = 32;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = sz;
  const ctx  = cvs.getContext('2d');
  const half = sz / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.00, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.20, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.2)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sz, sz);
  _sprite = new CanvasTexture(cvs);
  return _sprite;
}

// ── Config ────────────────────────────────────────────────────
const COMET_RADIUS  = 3200; // spawn/despawn sphere radius
const TRAIL_STEPS   = 32;   // history points for the tail
const COMET_SPEED   = 680;  // world units per second
const MIN_INTERVAL  = 3;    // seconds between comets (min)
const MAX_INTERVAL  = 9;    // seconds between comets (max)
const MAX_ACTIVE    = 4;    // max simultaneous comets

// Size tiers — [headSize, tailSize, opacity]
const SIZE_TIERS = [
  [3.5,  0.9, 0.70],  // tiny
  [6.0,  1.4, 0.80],  // small
  [9.0,  2.0, 0.90],  // medium (most common)
  [14.0, 2.8, 0.95],  // large
  [20.0, 4.0, 1.00],  // hero
];

// ── Comet colors — blue-white ice comets, occasional warm ones ─
const COMET_COLORS = [
  new Color(0xaaddff), // icy blue-white
  new Color(0xcceeFF), // cool white
  new Color(0xffeeaa), // warm dusty
  new Color(0xaaffcc), // greenish ion tail
];

// ──────────────────────────────────────────────────────────────

class Comet {
  constructor(scene, spr) {
    this._scene    = scene;
    this._history  = [];
    this._t        = 0;

    // Random size tier — weighted toward medium
    const tierRoll = Math.random();
    const tierIdx  = tierRoll < 0.18 ? 0
                   : tierRoll < 0.40 ? 1
                   : tierRoll < 0.72 ? 2
                   : tierRoll < 0.90 ? 3
                   : 4;
    const [headSz, tailSz, baseOp] = SIZE_TIERS[tierIdx];
    this._headSize = headSz;
    this._tailSize = tailSz;
    this._baseOp   = baseOp;

    // Random color
    const col   = COMET_COLORS[Math.floor(Math.random() * COMET_COLORS.length)];
    this._color = col;

    // Random direction and origin on background sphere
    const phi   = Math.random() * Math.PI * 2;
    const theta = Math.acos(2 * Math.random() - 1);
    this.pos = new Vector3(
      COMET_RADIUS * Math.sin(theta) * Math.cos(phi),
      COMET_RADIUS * Math.sin(theta) * Math.sin(phi),
      COMET_RADIUS * Math.cos(theta),
    );

    // Velocity: roughly across the sphere (perpendicular to radius + slight inward)
    const radial = this.pos.clone().normalize();
    const up     = Math.abs(radial.y) < 0.9
      ? new Vector3(0, 1, 0)
      : new Vector3(1, 0, 0);
    const perp1 = new Vector3().crossVectors(radial, up).normalize();
    const perp2 = new Vector3().crossVectors(radial, perp1).normalize();
    const angle  = Math.random() * Math.PI * 2;
    this.vel = perp1.clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(perp2, Math.sin(angle))
      .addScaledVector(radial, -0.08) // very slight inward drift
      .normalize()
      .multiplyScalar(COMET_SPEED);

    // Total distance before fade-out — travel ~60° of arc on sphere
    this._maxDist = COMET_RADIUS * Math.PI / 3;
    this._dist    = 0;
    this.dead     = false;

    // Head — single bright point (large)
    const hGeo = new BufferGeometry();
    hGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(3), 3));
    hGeo.setAttribute('color',    new Float32BufferAttribute(new Float32Array(3), 3));
    this._headGeo = hGeo;
    this._headPts = new Points(hGeo, new PointsMaterial({
      size: headSz, map: spr, vertexColors: true,
      transparent: true, opacity: baseOp,
      depthWrite: false, blending: AdditiveBlending,
      sizeAttenuation: true, alphaTest: 0.001,
    }));
    this._headPts.frustumCulled = false;
    this._scene.add(this._headPts);

    // Tail — trail of smaller points
    const tPos = new Float32Array(TRAIL_STEPS * 3);
    const tCol = new Float32Array(TRAIL_STEPS * 3);
    const tGeo = new BufferGeometry();
    tGeo.setAttribute('position', new Float32BufferAttribute(tPos, 3));
    tGeo.setAttribute('color',    new Float32BufferAttribute(tCol, 3));
    this._tailGeo = tGeo;
    this._tailPts = new Points(tGeo, new PointsMaterial({
      size: tailSz, map: spr, vertexColors: true,
      transparent: true, opacity: baseOp,
      depthWrite: false, blending: AdditiveBlending,
      sizeAttenuation: true, alphaTest: 0.001,
    }));
    this._tailPts.frustumCulled = false;
    this._scene.add(this._tailPts);
  }

  update(dt) {
    this._t += dt;

    // Move comet
    const step = this.vel.clone().multiplyScalar(dt);
    this.pos.add(step);
    this._dist += step.length();

    // Fade in over first 5% of journey, fade out over last 20%
    const progress    = this._dist / this._maxDist;
    const globalFade  = progress < 0.05
      ? (progress / 0.05)
      : progress > 0.80
        ? (1 - (progress - 0.80) / 0.20)
        : 1.0;

    if (progress >= 1.0) {
      this.dead = true;
      return;
    }

    // History for tail
    this._history.unshift(this.pos.clone());
    if (this._history.length > TRAIL_STEPS) this._history.pop();
    const n = this._history.length;

    const cr = this._color.r;
    const cg = this._color.g;
    const cb = this._color.b;

    // ── Head ────────────────────────────────────────────────
    const hPos = this._headGeo.attributes.position.array;
    const hCol = this._headGeo.attributes.color.array;
    hPos[0] = this.pos.x; hPos[1] = this.pos.y; hPos[2] = this.pos.z;
    hCol[0] = Math.min(1, cr + 0.5) * globalFade;
    hCol[1] = Math.min(1, cg + 0.5) * globalFade;
    hCol[2] = Math.min(1, cb + 0.5) * globalFade;
    this._headGeo.attributes.position.needsUpdate = true;
    this._headGeo.attributes.color.needsUpdate    = true;
    this._headGeo.setDrawRange(0, 1);

    // ── Tail ────────────────────────────────────────────────
    const tPos = this._tailGeo.attributes.position.array;
    const tCol = this._tailGeo.attributes.color.array;
    for (let i = 0; i < n; i++) {
      const h   = this._history[i];
      const idx = i * 3;
      tPos[idx]     = h.x;
      tPos[idx + 1] = h.y;
      tPos[idx + 2] = h.z;
      const fade    = Math.pow(1 - i / TRAIL_STEPS, 1.4) * globalFade;
      tCol[idx]     = cr * fade * 0.75;
      tCol[idx + 1] = cg * fade * 0.75;
      tCol[idx + 2] = cb * fade * 0.75;
    }
    this._tailGeo.attributes.position.needsUpdate = true;
    this._tailGeo.attributes.color.needsUpdate    = true;
    this._tailGeo.setDrawRange(0, n);
  }

  dispose() {
    this._scene.remove(this._headPts);
    this._scene.remove(this._tailPts);
    this._headGeo.dispose(); this._headPts.material.dispose();
    this._tailGeo.dispose(); this._tailPts.material.dispose();
  }
}

// ── Public class ─────────────────────────────────────────────

export class CometSystem {
  constructor(scene) {
    this._scene   = scene;
    this._comets  = [];
    this._timer   = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
    this._spr     = glowSprite();
  }

  /** Reset timer when a new hole loads so a comet arrives quickly. */
  onHoleLoaded() {
    this._timer = 5 + Math.random() * 10; // first comet in 5–15s
  }

  update(dt) {
    // Count down to next comet
    this._timer -= dt;
    if (this._timer <= 0) {
      if (this._comets.length < MAX_ACTIVE) {
        this._comets.push(new Comet(this._scene, this._spr));
      }
      this._timer = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
    }

    // Update active comets
    for (let i = this._comets.length - 1; i >= 0; i--) {
      const c = this._comets[i];
      c.update(dt);
      if (c.dead) {
        c.dispose();
        this._comets.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const c of this._comets) c.dispose();
    this._comets = [];
  }
}
