// ============================================================
// GolfBall.js — lava meteorite: cracked glowing surface + fire corona
// ============================================================

import {
  Mesh, SphereGeometry, MeshStandardMaterial,
  Vector3, PointLight, Group, CanvasTexture,
  MeshBasicMaterial, AdditiveBlending, BackSide,
} from 'three';
import { BALL } from '../core/Constants.js';

const S = 512;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── Lava-crack texture ─────────────────────────────────────
// Returns { albedo: CanvasTexture, emissive: CanvasTexture }
function makeCrackTextures(seed = 77) {
  const rng = mulberry32(seed);

  // -- Albedo canvas --
  const aCanvas = document.createElement('canvas');
  aCanvas.width = aCanvas.height = S;
  const ac = aCanvas.getContext('2d');

  // Very dark near-black base
  ac.fillStyle = '#060101';
  ac.fillRect(0, 0, S, S);

  // Faint hot interior glow (molten core peeking through)
  const glow = ac.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  glow.addColorStop(0,   'rgba(160,18,0,0.55)');
  glow.addColorStop(0.45,'rgba(70,6,0,0.28)');
  glow.addColorStop(1,   'rgba(0,0,0,0)');
  ac.fillStyle = glow;
  ac.fillRect(0, 0, S, S);

  // -- Emissive canvas: only crack lines in bright white/orange on black --
  const eCanvas = document.createElement('canvas');
  eCanvas.width = eCanvas.height = S;
  const ec = eCanvas.getContext('2d');
  ec.fillStyle = '#000000';
  ec.fillRect(0, 0, S, S);

  // Recursive crack generator
  function crack(x, y, angle, length, depth) {
    if (depth > 3 || length < 12) return;
    const steps = 3 + Math.floor(rng() * 5);
    const seg   = length / steps;
    let cx = x, cy = y;

    for (let s = 0; s < steps; s++) {
      angle += (rng() - 0.5) * 0.9;
      const nx = cx + Math.cos(angle) * seg;
      const ny = cy + Math.sin(angle) * seg;

      // Albedo — orange glow + bright core
      ac.beginPath();
      ac.strokeStyle = `rgba(255,55,0,${0.38 - depth * 0.07})`;
      ac.lineWidth = Math.max(0.5, 4 - depth);
      ac.moveTo(cx, cy); ac.lineTo(nx, ny);
      ac.stroke();

      ac.beginPath();
      ac.strokeStyle = `rgba(255,210,60,${0.75 - depth * 0.12})`;
      ac.lineWidth = Math.max(0.3, 1.6 - depth * 0.3);
      ac.moveTo(cx, cy); ac.lineTo(nx, ny);
      ac.stroke();

      // Emissive — same cracks but white
      ec.beginPath();
      ec.strokeStyle = `rgba(255,180,60,${0.9 - depth * 0.15})`;
      ec.lineWidth = Math.max(0.5, 3 - depth * 0.5);
      ec.moveTo(cx, cy); ec.lineTo(nx, ny);
      ec.stroke();

      cx = nx; cy = ny;

      if (rng() < 0.35) {
        crack(cx, cy, angle + (rng() < 0.5 ? 0.7 : -0.7), length * 0.5, depth + 1);
      }
    }
  }

  // Scatter starting cracks across the sphere face
  for (let i = 0; i < 14; i++) {
    const x = S * (0.12 + rng() * 0.76);
    const y = S * (0.12 + rng() * 0.76);
    crack(x, y, rng() * Math.PI * 2, 80 + rng() * 130, 0);
  }

  // Edge vignette (sphere wrap darkening toward poles)
  const vign = ac.createRadialGradient(S/2, S/2, S*0.18, S/2, S/2, S/2*1.05);
  vign.addColorStop(0,   'rgba(0,0,0,0)');
  vign.addColorStop(0.65,'rgba(0,0,0,0.25)');
  vign.addColorStop(1,   'rgba(0,0,0,0.90)');
  ac.fillStyle = vign;
  ac.fillRect(0, 0, S, S);

  const albedo   = new CanvasTexture(aCanvas);
  const emissive = new CanvasTexture(eCanvas);
  return { albedo, emissive };
}

// ── Corona glow (BackSide additive sphere) ────────────────
function buildCorona(r, color, opacity) {
  const geo = new SphereGeometry(r, 10, 6);
  const mat = new MeshBasicMaterial({
    color, transparent: true, opacity,
    side: BackSide, depthWrite: false, blending: AdditiveBlending,
  });
  return new Mesh(geo, mat);
}

// ──────────────────────────────────────────────────────────

export class GolfBall {
  constructor(color = 0xffffff) {
    this.color    = color;
    this.position = new Vector3();
    this.velocity = new Vector3();
    this._t       = 0;

    this.group = new Group();
    this._buildMesh();
    this._buildCoronas();
    this._buildLights();
  }

  _buildMesh() {
    const { albedo, emissive } = makeCrackTextures(42);
    const geo = new SphereGeometry(BALL.RADIUS, 24, 16);

    this.mesh = new Mesh(geo, new MeshStandardMaterial({
      map:               albedo,
      color:             0x110000,
      roughness:         0.95,
      metalness:         0.0,
      emissive:          0xff2200,
      emissiveMap:       emissive,
      emissiveIntensity: 1.2,
      transparent:       true,
      opacity:           1.0,
      depthWrite:        false,
    }));
    this.mesh.renderOrder      = 100;
    this.mesh.material.depthTest = false;
    this.group.add(this.mesh);
    this._albedoTex   = albedo;
    this._emissiveTex = emissive;
  }

  _buildCoronas() {
    // Inner hot orange halo
    this._coronaInner = buildCorona(BALL.RADIUS * 1.6,  0xff4400, 0.22);
    this._coronaInner.renderOrder = 99;
    this.group.add(this._coronaInner);

    // Outer diffuse fire glow
    this._coronaOuter = buildCorona(BALL.RADIUS * 2.6,  0xff2200, 0.10);
    this._coronaOuter.renderOrder = 98;
    this.group.add(this._coronaOuter);
  }

  _buildLights() {
    this.lightOrange = new PointLight(0xff4400, 1.8, 28);
    this.group.add(this.lightOrange);
    this.lightYellow = new PointLight(0xffaa00, 0.6, 12);
    this.group.add(this.lightYellow);
  }

  update(dt) {
    this._t += dt;
    const t     = this._t;
    const speed = this.velocity.length();
    const heat  = Math.min(1, speed / 55);

    // Emissive flicker — crack glow pulses
    this.mesh.material.emissiveIntensity =
      0.9 + Math.sin(t * 11) * 0.15 + Math.sin(t * 7.3) * 0.1 + heat * 0.5;

    // Inner corona breathes
    this._coronaInner.material.opacity =
      0.15 + Math.sin(t * 5.7) * 0.07 + heat * 0.20;

    // Outer corona pulses slower
    this._coronaOuter.material.opacity =
      0.06 + Math.sin(t * 3.1) * 0.04 + heat * 0.12;

    // Lights flicker
    this.lightOrange.intensity = 1.5 + Math.sin(t * 8.1) * 0.4 + heat * 1.2;
    this.lightYellow.intensity = 0.5 + Math.abs(Math.sin(t * 6.3)) * 0.3;
  }

  setPosition(pos) {
    this.position.copy(pos);
    this.group.position.copy(pos);
  }

  setVelocity(vel) { this.velocity.copy(vel); }

  launch(direction, power) {
    this.velocity.copy(direction).multiplyScalar(power);
  }

  syncMesh() { this.group.position.copy(this.position); }

  updateSpin(dt) {
    const speed = this.velocity.length();
    if (speed > 0.5) {
      const axis = this.velocity.clone().normalize();
      this.mesh.rotateOnWorldAxis(axis, speed * dt * 0.5);
    }
  }

  addToScene(scene)      { scene.add(this.group); }
  removeFromScene(scene) { scene.remove(this.group); this.dispose(); }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this._coronaInner.geometry.dispose(); this._coronaInner.material.dispose();
    this._coronaOuter.geometry.dispose(); this._coronaOuter.material.dispose();
    if (this._albedoTex)   this._albedoTex.dispose();
    if (this._emissiveTex) this._emissiveTex.dispose();
  }
}
