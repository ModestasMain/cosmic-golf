// ============================================================
// Wormhole.js — portal shortcut toward the black hole (cup)
//
// Visual inspired by the reference image:
//   • Many concentric rings — bright white center → faint blue outer
//   • Deep void disc at center (the tunnel opening)
//   • Funnel rings receding behind the portal face (depth illusion)
//   • Particles continuously streaming inward (sucked into the void)
//   • Orbiting debris chunks as a gameplay hazard
//
// Always oriented to face the tee so the player sees it face-on.
//
// Odds: 20% hole-in-one, 80% exciting near-miss.
// ============================================================

import {
  Group, TorusGeometry, CircleGeometry, SphereGeometry,
  MeshBasicMaterial, MeshStandardMaterial,
  BufferGeometry, BufferAttribute, Points, PointsMaterial,
  AdditiveBlending, PointLight, Mesh, Vector3,
} from 'three';

export const WORMHOLE_CAPTURE_RADIUS = 18;
export const WORMHOLE_ENTER_RADIUS   = 3.2;

const BALL_RADIUS_REF = 0.8;
const RIM_R           = 4.5; // visible portal mouth radius (matches gameplay enter radius visually)

export class Wormhole {
  constructor(position, teePos) {
    this.position = position.clone();
    this._group   = new Group();
    this._group.position.copy(position);
    this._time      = 0;
    this._activated = false;
    this._debris    = [];
    this._rings     = [];
    this._funnelRings = [];

    this._build();

    // Face portal toward the tee — all XY-plane geometry now looks at the player
    if (teePos) {
      const toTee = new Vector3().subVectors(teePos, position).normalize();
      this._group.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), toTee);
    }
  }

  _build() {
    // ── 1. Concentric rings — the wormhole mouth ──────────────────
    // Bright white innermost → faint blue outermost, all in XY plane.
    const RING_DEFS = [
      { r: 0.9,  tube: 0.20, color: 0xffffff, opacity: 1.00 },
      { r: 1.7,  tube: 0.15, color: 0xeef6ff, opacity: 0.88 },
      { r: 2.6,  tube: 0.12, color: 0xccddff, opacity: 0.74 },
      { r: 3.5,  tube: 0.10, color: 0xaabbff, opacity: 0.58 },
      { r: 4.5,  tube: 0.09, color: 0x88aaff, opacity: 0.42 }, // ← this is RIM_R
      { r: 5.8,  tube: 0.08, color: 0x6688ee, opacity: 0.26 },
      { r: 7.4,  tube: 0.06, color: 0x4466cc, opacity: 0.15 },
      { r: 9.5,  tube: 0.05, color: 0x2244aa, opacity: 0.08 },
    ];
    for (const def of RING_DEFS) {
      const geo  = new TorusGeometry(def.r, def.tube, 8, 80);
      const mat  = new MeshBasicMaterial({
        color: def.color, transparent: true,
        opacity: def.opacity, depthWrite: false,
      });
      const mesh = new Mesh(geo, mat);
      this._group.add(mesh);
      this._rings.push(mesh);
    }

    // ── 2. Void disc — deep dark center ───────────────────────────
    const voidGeo = new CircleGeometry(0.85, 32);
    const voidMat = new MeshBasicMaterial({
      color: 0x000008, transparent: true, opacity: 0.99, depthWrite: false,
    });
    this._void = new Mesh(voidGeo, voidMat);
    this._void.position.z = 0.15;
    this._group.add(this._void);

    // ── 3. Funnel rings — depth illusion behind the portal ─────────
    // Rings shrink in radius and step back in -Z, creating the
    // "tunnel sucking inward" look visible at a slight angle.
    const FUNNEL_COUNT = 10;
    const FUNNEL_DEPTH = 12;
    for (let i = 0; i < FUNNEL_COUNT; i++) {
      const t   = (i + 1) / FUNNEL_COUNT;
      const r   = RIM_R * (1 - t * 0.88);
      const z   = -t * FUNNEL_DEPTH;
      const op  = 0.30 * (1 - t * 0.75);
      const geo = new TorusGeometry(r, 0.07, 6, 48);
      const mat = new MeshBasicMaterial({
        color: 0x99bbff, transparent: true, opacity: op, depthWrite: false,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.z = z;
      this._group.add(mesh);
      this._funnelRings.push(mesh);
    }

    // ── 4. Inward-streaming particles ─────────────────────────────
    // Particles on spiral paths that continuously drift inward.
    // When they reach the void they reset to the outer rim.
    // This is the key "sucking in" visual effect.
    const PART       = 240;
    const pPos       = new Float32Array(PART * 3);
    const pClr       = new Float32Array(PART * 3);
    this._partAngles  = new Float32Array(PART);
    this._partRadii   = new Float32Array(PART);
    this._partOmega   = new Float32Array(PART); // angular speed (rad/s)
    this._partVr      = new Float32Array(PART); // inward radial speed

    for (let i = 0; i < PART; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.4 + Math.random() * (RIM_R * 2.0 - 0.4); // spread out to outer halo rings

      this._partAngles[i] = ang;
      this._partRadii[i]  = rad;
      // Closer particles spin faster (conserve angular momentum look)
      this._partOmega[i]  = (0.8 + Math.random() * 0.8) * (RIM_R / Math.max(rad, 0.5));
      this._partVr[i]     = 0.6 + Math.random() * 1.2; // units/s inward

      pPos[i * 3]     = Math.cos(ang) * rad;
      pPos[i * 3 + 1] = Math.sin(ang) * rad;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;

      this._setParticleColor(pClr, i, rad);
    }

    const partGeo = new BufferGeometry();
    partGeo.setAttribute('position', new BufferAttribute(pPos, 3));
    partGeo.setAttribute('color',    new BufferAttribute(pClr, 3));
    this._partMat = new PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.90,
      depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true,
    });
    this._particles   = new Points(partGeo, this._partMat);
    this._particlePos = pPos;
    this._particleClr = pClr;
    this._group.add(this._particles);

    // ── 5. Blue-white point light ──────────────────────────────────
    this._light = new PointLight(0x99aaff, 4.0, 100);
    this._group.add(this._light);

    // ── 6. Orbiting debris ─────────────────────────────────────────
    const debrisColors = [0x887766, 0x998855, 0x776655, 0xaaa988];
    for (let i = 0; i < 4; i++) {
      const orbitR  = 18 + Math.random() * 20;
      const speed   = (0.3 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1);
      const angle   = (i / 4) * Math.PI * 2 + Math.random() * 0.9;
      const tiltAng = (Math.random() - 0.5) * Math.PI * 0.6;
      const collR   = 2.0 + Math.random() * 2.0;
      const geo     = new SphereGeometry(collR, 5, 4);
      const mat     = new MeshStandardMaterial({
        color: debrisColors[i], roughness: 0.9, metalness: 0.1,
        emissive: 0x221100, emissiveIntensity: 0.4,
      });
      const mesh = new Mesh(geo, mat);
      // NOT added to group — added directly to scene in addToScene()
      // so depth-testing works correctly against planets.
      this._debris.push({
        mesh, orbitR, angle, speed,
        tiltSin: Math.sin(tiltAng),
        tiltCos: Math.cos(tiltAng),
        collR,
        worldPos: new Vector3(),
      });
    }
  }

  /** Teal→white gradient for particles based on radius. */
  _setParticleColor(clr, i, rad) {
    const maxR = RIM_R * 2.0;
    const t    = Math.min(rad / maxR, 1); // 0 = inner (white), 1 = outer (blue)
    clr[i * 3]     = 0.55 + (1 - t) * 0.45; // R: white center, blue outer
    clr[i * 3 + 1] = 0.70 + (1 - t) * 0.30; // G
    clr[i * 3 + 2] = 1.00;                   // B always full
  }

  addToScene(scene) {
    this._scene = scene;
    scene.add(this._group);
    // Debris added at scene root — not inside the transparent group —
    // so the depth buffer is respected and they're hidden behind planets.
    for (const d of this._debris) scene.add(d.mesh);
  }

  removeFromScene(scene) {
    scene.remove(this._group);
    for (const d of this._debris) scene.remove(d.mesh);
    this._dispose();
  }

  _dispose() {
    for (const m of this._rings)       { m.geometry.dispose(); m.material.dispose(); }
    for (const m of this._funnelRings) { m.geometry.dispose(); m.material.dispose(); }
    this._void.geometry.dispose();      this._void.material.dispose();
    this._particles.geometry.dispose(); this._partMat.dispose();
    for (const d of this._debris)      { d.mesh.geometry.dispose(); d.mesh.material.dispose(); }
    this._debris = [];
  }

  update(dt) {
    this._time += dt;

    // All mouth rings spin slowly together
    const ringRot = dt * 0.18;
    for (const r of this._rings) r.rotation.z += ringRot;

    // Funnel rings counter-spin slightly for depth cue
    for (let i = 0; i < this._funnelRings.length; i++) {
      this._funnelRings[i].rotation.z -= dt * (0.12 + i * 0.02);
    }

    // Light pulse
    this._light.intensity = 4.0 + Math.sin(this._time * 2.6) * 1.2;

    // Innermost bright ring pulses in opacity
    if (this._rings[0]) {
      this._rings[0].material.opacity = 0.88 + Math.sin(this._time * 3.5) * 0.12;
    }

    // ── Stream particles inward ────────────────────────────────────
    const PART       = this._partAngles.length;
    const inwardMult = this._activated ? 3.0 : 1.0; // suction speeds up when ball nearby
    for (let i = 0; i < PART; i++) {
      // Angular velocity conserves (faster when closer to center)
      const omega = this._partOmega[i] * (RIM_R / Math.max(this._partRadii[i], 0.5));
      this._partAngles[i] += Math.min(omega, 8.0) * dt;
      this._partRadii[i]  -= this._partVr[i] * inwardMult * dt;

      // Reset to outer rim when swallowed
      if (this._partRadii[i] < 0.25) {
        this._partRadii[i]  = RIM_R * 1.5 + Math.random() * RIM_R * 0.6;
        this._partAngles[i] = Math.random() * Math.PI * 2;
        this._setParticleColor(this._particleClr, i, this._partRadii[i]);
      }

      const rad = this._partRadii[i];
      this._particlePos[i * 3]     = Math.cos(this._partAngles[i]) * rad;
      this._particlePos[i * 3 + 1] = Math.sin(this._partAngles[i]) * rad;
    }
    this._particles.geometry.attributes.position.needsUpdate = true;
    this._particles.geometry.attributes.color.needsUpdate    = true;

    this._activated = false;

    // ── Orbit debris in world space ───────────────────────────────
    // Meshes live at scene root so positions are world-space directly.
    for (const d of this._debris) {
      d.angle += d.speed * dt;
      const wx = Math.cos(d.angle) * d.orbitR;
      const wz = Math.sin(d.angle) * d.orbitR;
      d.mesh.position.set(
        this.position.x + wx,
        this.position.y + wz * d.tiltSin,
        this.position.z + wz * d.tiltCos,
      );
      d.mesh.rotation.x += dt * 0.7;
      d.mesh.rotation.y += dt * 0.5;
      d.worldPos.copy(d.mesh.position);
    }
  }

  applySuction(ball, dt) {
    this._activated = true;
    const toWorm = new Vector3().subVectors(this.position, ball.position);
    const dist   = toWorm.length();
    if (dist < 0.1) return;
    const t        = 1 - dist / WORMHOLE_CAPTURE_RADIUS;
    const strength = 600 * t * t;
    ball.velocity.addScaledVector(toWorm.normalize(), strength * dt);
  }

  applyDebrisDeflection(ball) {
    let hit = false;
    for (const d of this._debris) {
      const dist    = ball.position.distanceTo(d.worldPos);
      const minDist = d.collR + BALL_RADIUS_REF;
      if (dist < minDist && dist > 0.01) {
        const away = new Vector3().subVectors(ball.position, d.worldPos).normalize();
        ball.position.copy(d.worldPos).addScaledVector(away, minDist + 0.2);
        const dot = ball.velocity.dot(away);
        if (dot < 0) {
          ball.velocity.addScaledVector(away, -(1 + 0.5) * dot);
          const tang = new Vector3(
            (Math.random() - 0.5),
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5),
          ).normalize();
          ball.velocity.addScaledVector(tang, 12);
        }
        hit = true;
      }
    }
    return hit;
  }

  checkBallEntered(ballPos) {
    return ballPos.distanceTo(this.position) < WORMHOLE_ENTER_RADIUS;
  }
}
