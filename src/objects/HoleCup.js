// ============================================================
// HoleCup.js — black hole: event horizon + full dynamic environment
// ============================================================

import {
  Mesh, SphereGeometry, TorusGeometry,
  MeshBasicMaterial, Group, Color,
  AdditiveBlending, BackSide, PointLight,
  BufferGeometry, Float32BufferAttribute, Points, PointsMaterial,
  Vector3,
} from 'three';
import { HOLE } from '../core/Constants.js';

const HORIZON_R  = 4;
const DISK_TILT  = 0.35;

export class HoleCup {
  constructor(position, color = 0xffd700) {
    this.position  = position.clone();
    this.color     = color;
    this.group     = new Group();
    this.group.position.copy(position);

    this._t    = 0;
    this._sunk = false;

    this._buildHorizon();
    this._buildLens();
    this._buildDisk();
    this._buildVortex();
    this._buildGravRings();
    this._buildLight();
  }

  // ── Event horizon ─────────────────────────────────────────

  _buildHorizon() {
    const geo = new SphereGeometry(HORIZON_R, 32, 16);
    this.horizon = new Mesh(geo, new MeshBasicMaterial({ color: 0x000000 }));
    this.group.add(this.horizon);
  }

  // ── Gravitational lensing glow ────────────────────────────

  _buildLens() {
    const geo = new SphereGeometry(HORIZON_R * 1.7, 16, 8);
    this.lensGlow = new Mesh(geo, new MeshBasicMaterial({
      color: 0x220066,
      side: BackSide,
      transparent: true, opacity: 0.22,
      depthWrite: false, blending: AdditiveBlending,
    }));
    this.group.add(this.lensGlow);
  }

  // ── Accretion disk — multi-speed rings ────────────────────

  _buildDisk() {
    this.diskGroup = new Group();
    this.diskGroup.rotation.x = DISK_TILT;
    this.group.add(this.diskGroup);

    this._diskRings = [
      this._ring(HORIZON_R * 1.55, 0.5, 0xffffff,  0.95, 1.4),   // inner — fastest
      this._ring(HORIZON_R * 2.1,  0.7, 0xff9900,  0.75, 1.0),
      this._ring(HORIZON_R * 2.9,  0.5, 0xff3300,  0.5,  0.7),
      this._ring(HORIZON_R * 3.8,  0.3, 0x881100,  0.25, -0.45), // counter-rotate
      this._ring(HORIZON_R * 5.0,  0.2, 0x440800,  0.15, -0.25),
    ];
  }

  _ring(r, tube, color, opacity, spinSpeed) {
    const geo  = new TorusGeometry(r, tube, 6, 64);
    const mat  = new MeshBasicMaterial({
      color, transparent: true, opacity,
      depthWrite: false, blending: AdditiveBlending,
    });
    const mesh = new Mesh(geo, mat);
    this.diskGroup.add(mesh);
    return { mesh, spinSpeed, baseOpacity: opacity };
  }

  // ── Particle vortex ───────────────────────────────────────

  _buildVortex() {
    const count = 180;
    const pos   = new Float32Array(count * 3);
    const col   = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const angle  = (i / count) * Math.PI * 2;
      const layer  = i % 3;
      const r      = HORIZON_R * (1.6 + layer * 0.9) + Math.random() * 2.5;
      const height = (Math.random() - 0.5) * 3.5 * Math.cos(DISK_TILT);

      pos[i * 3]     = Math.cos(angle) * r;
      pos[i * 3 + 1] = height;
      pos[i * 3 + 2] = Math.sin(angle) * r;

      const brightness = 1.0 - layer * 0.28;
      col[i * 3]     = brightness;
      col[i * 3 + 1] = brightness * (0.7 - layer * 0.2);
      col[i * 3 + 2] = layer === 0 ? brightness * 0.3 : 0;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color',    new Float32BufferAttribute(col, 3));

    this.vortex = new Points(geo, new PointsMaterial({
      size: 1.0, vertexColors: true,
      transparent: true, opacity: 0.85,
      depthWrite: false, blending: AdditiveBlending,
      sizeAttenuation: true,
    }));
    this.group.add(this.vortex);

    // Second, sparser counter-vortex
    const count2 = 80;
    const pos2   = new Float32Array(count2 * 3);
    const col2   = new Float32Array(count2 * 3);
    for (let i = 0; i < count2; i++) {
      const angle = (i / count2) * Math.PI * 2 + Math.PI / count2;
      const r     = HORIZON_R * 2.5 + Math.random() * HORIZON_R * 2;
      const h     = (Math.random() - 0.5) * 5;
      pos2[i * 3]     = Math.cos(angle) * r;
      pos2[i * 3 + 1] = h;
      pos2[i * 3 + 2] = Math.sin(angle) * r;
      col2[i * 3]     = 0.4; col2[i * 3 + 1] = 0.15; col2[i * 3 + 2] = 0;
    }
    const geo2 = new BufferGeometry();
    geo2.setAttribute('position', new Float32BufferAttribute(pos2, 3));
    geo2.setAttribute('color',    new Float32BufferAttribute(col2, 3));
    this.vortex2 = new Points(geo2, new PointsMaterial({
      size: 0.7, vertexColors: true,
      transparent: true, opacity: 0.5,
      depthWrite: false, blending: AdditiveBlending,
    }));
    this.group.add(this.vortex2);
  }

  // ── Gravitational pull rings ───────────────────────────────
  // Like planet gravity field but faster — shows the black hole pulling space

  _buildGravRings() {
    this._gravRings = [];
    const colors = [0xff8800, 0xff4400, 0xff2200, 0xaa1100];
    for (let i = 0; i < 2; i++) {
      const geo = new TorusGeometry(1, 0.12, 4, 64);
      const mat = new MeshBasicMaterial({
        color: colors[i], transparent: true, opacity: 0,
        depthWrite: false, blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.rotation.x = DISK_TILT;
      this.group.add(mesh);
      this._gravRings.push({
        mesh,
        phase: i / 4,
        minR:  HORIZON_R * 1.1,
        maxR:  HORIZON_R * 7,
        speed: 0.5,
      });
    }
  }

  // ── Polar relativistic jets ────────────────────────────────

  _buildJets() {
    const jetGeo = new CylinderGeometry(0.15, 0.6, HORIZON_R * 8, 6);
    const jetMat = new MeshBasicMaterial({
      color: 0x6699ff, transparent: true, opacity: 0.18,
      depthWrite: false, blending: AdditiveBlending,
    });

    this.jetNorth = new Mesh(jetGeo, jetMat);
    this.jetNorth.position.y = HORIZON_R * 4;
    this.group.add(this.jetNorth);

    this.jetSouth = new Mesh(jetGeo.clone(), jetMat.clone());
    this.jetSouth.position.y = -HORIZON_R * 4;
    this.jetSouth.rotation.z = Math.PI;
    this.group.add(this.jetSouth);

    // Jet core — brighter thin beam
    const coreGeo = new CylinderGeometry(0.04, 0.04, HORIZON_R * 10, 4);
    const coreMat = new MeshBasicMaterial({
      color: 0xaaccff, transparent: true, opacity: 0.5,
      depthWrite: false, blending: AdditiveBlending,
    });
    this.jetCoreN = new Mesh(coreGeo, coreMat);
    this.jetCoreN.position.y = HORIZON_R * 5;
    this.group.add(this.jetCoreN);
    this.jetCoreS = new Mesh(coreGeo.clone(), coreMat.clone());
    this.jetCoreS.position.y = -HORIZON_R * 5;
    this.group.add(this.jetCoreS);
  }

  // ── Lighting ─────────────────────────────────────────────

  _buildLight() {
    this.light = new PointLight(0xff6600, 2.0, 80);
    this.group.add(this.light);
    // Second blue light for jet effect
    this.lightBlue = new PointLight(0x4466ff, 0.6, 40);
    this.group.add(this.lightBlue);
  }

  // ── Update ────────────────────────────────────────────────

  update(dt) {
    this._t += dt;
    const t = this._t;

    // Disk rings — each spinning at own speed
    for (const r of this._diskRings) {
      r.mesh.rotation.z += dt * r.spinSpeed;
      // Subtle flicker
      r.mesh.material.opacity = r.baseOpacity * (0.9 + Math.sin(t * 7 + r.spinSpeed) * 0.1);
    }

    // Vortex — main spins fast, counter spins slow backward
    this.vortex.rotation.y  += dt * 0.9;
    this.vortex2.rotation.y -= dt * 0.35;

    // Grav rings: pulse inward
    for (const r of this._gravRings) {
      r.phase = (r.phase + dt * r.speed) % 1;
      const scale = r.maxR * (1 - r.phase) + r.minR * r.phase;
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = Math.sin(r.phase * Math.PI) * 0.18;
    }

    // Lens glow breathe
    this.lensGlow.material.opacity = 0.14 + Math.sin(t * 0.9) * 0.08;

    // Point light flicker
    this.light.intensity     = 1.8 + Math.sin(t * 2.5) * 0.4;
    this.lightBlue.intensity = 0.5 + Math.abs(Math.sin(t * 3.7)) * 0.4;

    // Horizon pulse — barely perceptible breathe
    const hs = 1 + Math.sin(t * 1.3) * 0.02;
    this.horizon.scale.setScalar(hs);

    // Suck intensification
    if (this._sucking) {
      this._suckT = Math.min(1, this._suckT + dt * 1.2);
      const s = this._suckT;
      // Speed up rings
      for (const r of this._diskRings) {
        r.mesh.rotation.z += dt * r.spinSpeed * s * 4;
      }
      // Brighten grav rings
      for (const r of this._gravRings) {
        r.mesh.material.opacity = Math.min(0.6, r.mesh.material.opacity + s * 0.02);
      }
      // Brighten lens
      this.lensGlow.material.opacity = Math.min(0.7, 0.14 + s * 0.56);
      // Intensify lights
      this.light.intensity     = Math.min(8, 1.8 + s * 6);
      this.lightBlue.intensity = Math.min(4, 0.5 + s * 3.5);
    }
  }

  // ── Suck activation — call when ball enters ───────────────

  activateSuck() {
    this._sucking = true;
    this._suckT   = 0;
  }

  // ── Collision ─────────────────────────────────────────────

  checkBallHoled(ball) {
    if (this._sunk) return false;
    if (ball.position.distanceTo(this.position) < HOLE.CUP_RADIUS) {
      this._sunk = true;
      return true;
    }
    return false;
  }

  reset() { this._sunk = false; }

  addToScene(scene)    { scene.add(this.group); }
  removeFromScene(scene) { scene.remove(this.group); this.dispose(); }

  dispose() {
    [this.horizon, this.lensGlow].forEach(m => { m.geometry.dispose(); m.material.dispose(); });

    for (const r of this._diskRings) { r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
    for (const r of this._gravRings) { r.mesh.geometry.dispose(); r.mesh.material.dispose(); }

    [this.vortex, this.vortex2].forEach(v => {
      v.geometry.dispose(); v.material.dispose();
    });
  }
}
