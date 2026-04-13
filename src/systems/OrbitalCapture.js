// ============================================================
// OrbitalCapture.js — orbital capture mechanic system
//
// States: NONE → HOLDING_ENTER → ORBITING → HOLDING_EXIT → SLINGSHOT
//
// Only activates when ball is glued to a planet after 3 bounces.
// Player holds to charge → enters orbit → holds again to slingshot exit.
// ============================================================

import {
  Vector3, TorusGeometry, MeshBasicMaterial, Mesh,
  RingGeometry, AdditiveBlending, Color, Group,
} from 'three';
import { BALL } from '../core/Constants.js';
import { ORBIT } from '../core/Constants.js';
import { eventBus, Events } from '../core/EventBus.js';

// ── OrbitalCapture ──────────────────────────────────────────
export class OrbitalCapture {
  constructor() {
    this.state = 'NONE'; // NONE | HOLDING_ENTER | ORBITING | HOLDING_EXIT

    // Planet the ball is attached to
    this._planetIdx    = -1;
    this._planet       = null;   // planet data object { position, radius, mass }
    this._planetObj    = null;   // Planet visual object

    // Orbit geometry
    this._orbitAngle   = 0;
    this._orbitRadius  = 0;
    this._orbitSpeed   = ORBIT.ORBIT_SPEED;
    this._orbitNormal  = new Vector3(0, 1, 0); // plane normal (perpendicular to surface normal)
    this._orbitsDone   = 0;
    this._orbitAxis1   = new Vector3(1, 0, 0);
    this._orbitAxis2   = new Vector3(0, 0, 1);

    // Hold timers
    this._holdTimer    = 0;
    this._holdRequired = 0;

    // Drag adjustment while orbiting
    this._dragX = 0;

    // 3D visuals (added to scene lazily)
    this._group = new Group();
    this._ringMesh = null;
    this._progressRing = null;
    this._scene = null;

    // UI prompt element
    this._promptEl = null;
    this._buildPrompt();

    // Particles for orbital trail
    this._particles = [];
    this._particleTimer = 0;
  }

  // ── Prompt UI ──────────────────────────────────────────────
  _buildPrompt() {
    this._promptEl = document.createElement('div');
    this._promptEl.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:50%',
      'transform:translate(-50%,-50%)',
      'color:rgba(120,200,255,0.9)',
      'font-family:monospace',
      'font-size:14px',
      'letter-spacing:2px',
      'text-align:center',
      'pointer-events:none',
      'z-index:200',
      'display:none',
      'text-shadow:0 0 12px rgba(60,160,255,0.6),0 0 30px rgba(60,160,255,0.3)',
      'transition:opacity 0.2s',
    ].join(';');
    document.body.appendChild(this._promptEl);
  }

  _showPrompt(text) {
    this._promptEl.textContent = text;
    this._promptEl.style.display = 'block';
  }

  _hidePrompt() {
    this._promptEl.style.display = 'none';
  }

  // ── Scene visuals ──────────────────────────────────────────
  _ensureVisuals(scene) {
    if (this._scene === scene) return;
    this._scene = scene;
    scene.add(this._group);

    // Orbital path ring (faint blue)
    const ringGeo = new TorusGeometry(1, 0.15, 8, 128);
    const ringMat = new MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.25,
      depthWrite: false, blending: AdditiveBlending,
    });
    this._ringMesh = new Mesh(ringGeo, ringMat);
    this._ringMesh.rotation.x = Math.PI / 2;
    this._group.add(this._ringMesh);

    // Progress ring (fills as hold progresses)
    const progGeo = new RingGeometry(1 - 0.08, 1, 64, 1, 0, 0);
    const progMat = new MeshBasicMaterial({
      color: 0x88ddff, transparent: true, opacity: 0.7,
      depthWrite: false, blending: AdditiveBlending, side: 2,
    });
    this._progressRing = new Mesh(progGeo, progMat);
    this._progressRing.rotation.x = Math.PI / 2;
    this._group.add(this._progressRing);
  }

  _removeVisuals() {
    if (this._scene && this._group.parent) {
      this._scene.remove(this._group);
    }
    this._scene = null;
  }

  // ── Public API ─────────────────────────────────────────────

  get isActive() { return this.state !== 'NONE'; }
  get isOrbiting() { return this.state === 'ORBITING'; }

  canCapture(ballGlued, bounceStreak, bouncePlanetIdx) {
    return ballGlued && bounceStreak >= ORBIT.BOUNCE_THRESHOLD && bouncePlanetIdx >= 0;
  }

  /**
   * Start holding for orbital capture entry.
   */
  startCaptureHold(planetIdx, planets, planetObjects, scene) {
    if (this.state !== 'NONE') return;

    this._planetIdx = planetIdx;
    this._planet = planets[planetIdx];
    this._planetObj = planetObjects[planetIdx];
    this.state = 'HOLDING_ENTER';
    this._holdTimer = 0;
    this._holdRequired = ORBIT.CAPTURE_HOLD_SECS;

    this._ensureVisuals(scene);
    this._showPrompt('HOLD TO ORBIT');
    eventBus.emit(Events.ORBIT_CAPTURE_START);
  }

  /**
   * Start holding for orbital exit (slingshot).
   */
  startExitHold() {
    if (this.state !== 'ORBITING') return;
    this.state = 'HOLDING_EXIT';
    this._holdTimer = 0;
    this._holdRequired = ORBIT.EXIT_HOLD_SECS;
    this._showPrompt('HOLD TO LAUNCH');
    eventBus.emit(Events.ORBIT_EXIT_START);
  }

  /**
   * Cancel current hold (released before completion).
   */
  cancelHold() {
    if (this.state === 'HOLDING_ENTER') {
      this.state = 'NONE';
      this._hidePrompt();
      this._removeVisuals();
      eventBus.emit(Events.ORBIT_CAPTURE_CANCEL);
    } else if (this.state === 'HOLDING_EXIT') {
      this.state = 'ORBITING';
      this._showPrompt('HOLD TO LAUNCH');
      eventBus.emit(Events.ORBIT_EXIT_CANCEL);
    }
  }

  /**
   * Set horizontal drag for orbit speed/radius adjustment.
   */
  setDrag(dx) {
    this._dragX = dx;
  }

  /**
   * Force exit — used when max orbits reached.
   */
  forceExit() {
    this._doSlingshot();
  }

  /**
   * Full reset — call when ball resets or hole changes.
   */
  reset() {
    this.state = 'NONE';
    this._planetIdx = -1;
    this._planet = null;
    this._planetObj = null;
    this._holdTimer = 0;
    this._orbitAngle = 0;
    this._orbitsDone = 0;
    this._dragX = 0;
    this._hidePrompt();
    this._removeVisuals();
    this._particles = [];
  }

  /**
   * Main update — call every frame.
   * Returns the ball position if orbiting, or null.
   */
  update(dt, ball) {
    if (this.state === 'NONE') return null;

    if (!this._planet) {
      this.reset();
      return null;
    }

    const planetPos = this._planet.position;
    const planetR = this._planet.radius;

    // ── HOLDING_ENTER ────────────────────────────────────────
    if (this.state === 'HOLDING_ENTER') {
      this._holdTimer += dt;
      const progress = Math.min(this._holdTimer / this._holdRequired, 1);

      // Update progress ring
      this._updateProgressRing(progress, planetR);

      // Position group at planet
      this._group.position.copy(planetPos);

      if (progress >= 1) {
        // Capture complete → enter orbit
        this._enterOrbit(ball, planetPos, planetR);
        eventBus.emit(Events.ORBIT_CAPTURE_DONE);
        eventBus.emit(Events.ORBIT_ENTER);
      }

      return null;
    }

    // ── HOLDING_EXIT ──────────────────────────────────────────
    if (this.state === 'HOLDING_EXIT') {
      this._holdTimer += dt;
      const progress = Math.min(this._holdTimer / this._holdRequired, 1);

      this._updateProgressRing(progress, this._orbitRadius);

      // Continue orbiting while charging exit
      this._stepOrbit(dt, ball, planetPos);

      if (progress >= 1) {
        this._doSlingshot();
        return null;
      }

      return ball.position.clone();
    }

    // ── ORBITING ──────────────────────────────────────────────
    if (this.state === 'ORBITING') {
      this._stepOrbit(dt, ball, planetPos);

      // Check max orbits
      if (this._orbitsDone >= ORBIT.MAX_ORBITS) {
        this._doSlingshot();
        return null;
      }

      // Update prompt
      const remaining = ORBIT.MAX_ORBITS - this._orbitsDone;
      const partial = (this._orbitAngle % (Math.PI * 2)) / (Math.PI * 2);
      this._showPrompt(`ORBIT ${this._orbitsDone + (partial > 0.5 ? 1 : 0)}/${ORBIT.MAX_ORBITS} — HOLD TO LAUNCH`);

      // Hide progress ring while just orbiting
      if (this._progressRing) this._progressRing.visible = false;

      return ball.position.clone();
    }

    return null;
  }

  // ── Internal helpers ──────────────────────────────────────

  _enterOrbit(ball, planetPos, planetR) {
    this.state = 'ORBITING';
    this._orbitRadius = planetR + ORBIT.ORBIT_RADIUS_OFFSET + BALL.RADIUS;
    this._orbitSpeed = ORBIT.ORBIT_SPEED;
    this._orbitsDone = 0;
    this._orbitAngle = 0;

    // Compute orbit plane: perpendicular to the surface normal at ball position
    const surfNormal = ball.position.clone().sub(planetPos).normalize();
    this._orbitNormal.copy(surfNormal);

    // Find two axes in the orbit plane
    const up = Math.abs(surfNormal.y) < 0.9
      ? new Vector3(0, 1, 0)
      : new Vector3(1, 0, 0);
    this._orbitAxis1.crossVectors(surfNormal, up).normalize();
    this._orbitAxis2.crossVectors(surfNormal, this._orbitAxis1).normalize();

    // Update visual ring
    this._ringMesh.scale.setScalar(this._orbitRadius);
    // Orient the ring to match orbit plane
    this._group.quaternion.setFromUnitVectors(
      new Vector3(0, 1, 0),
      this._orbitNormal
    );
    this._ringMesh.visible = true;

    this._showPrompt('ORBIT 0/' + ORBIT.MAX_ORBITS + ' — HOLD TO LAUNCH');

    // Activate trail for orbit
    if (ball.trail) ball.trail.setActive(true);
  }

  _stepOrbit(dt, ball, planetPos) {
    // Apply drag adjustment
    this._orbitSpeed += this._dragX * ORBIT.DRAG_SPEED_SENS * dt;
    this._orbitSpeed = Math.max(0.5, Math.min(this._orbitSpeed, 4.0));

    const prevAngle = this._orbitAngle;
    this._orbitAngle += this._orbitSpeed * dt;

    // Track completed orbits
    const prevFull = Math.floor(prevAngle / (Math.PI * 2));
    const currFull = Math.floor(this._orbitAngle / (Math.PI * 2));
    if (currFull > prevFull) {
      this._orbitsDone = currFull;
    }

    // Compute position on orbit circle
    const a = this._orbitAngle;
    const r = this._orbitRadius;
    const offset = new Vector3()
      .addScaledVector(this._orbitAxis1, Math.cos(a) * r)
      .addScaledVector(this._orbitAxis2, Math.sin(a) * r);

    ball.position.copy(planetPos).add(offset);
    ball.syncMesh();

    // Update visual ring position
    this._group.position.copy(planetPos);

    // Spin the ball mesh for visual flair
    ball.mesh.rotateY(this._orbitSpeed * dt * 2);

    // Orbit particles
    this._particleTimer += dt;
    if (this._particleTimer > 0.05) {
      this._particleTimer = 0;
      this._spawnOrbitParticle(ball.position);
    }
  }

  _doSlingshot() {
    // Compute tangential direction for slingshot
    const a = this._orbitAngle;
    const tangent = new Vector3()
      .addScaledVector(this._orbitAxis1, -Math.sin(a))
      .addScaledVector(this._orbitAxis2, Math.cos(a))
      .normalize();

    // Also add a slight outward push (away from planet)
    const outward = this._orbitNormal.clone();

    const launchDir = tangent.addScaledVector(outward, 0.25).normalize();
    const launchVel = launchDir.multiplyScalar(ORBIT.SLINGSHOT_SPEED);

    // Store launch velocity for HoleScene to pick up
    this._slingshotVel = launchVel;

    this.state = 'NONE';
    this._hidePrompt();
    this._removeVisuals();

    eventBus.emit(Events.ORBIT_EXIT_DONE, { velocity: launchVel });
  }

  get slingshotVelocity() { return this._slingshotVel || null; }

  _updateProgressRing(progress, radius) {
    if (!this._progressRing) return;
    this._progressRing.visible = true;

    // Rebuild ring geometry for current progress arc
    this._progressRing.geometry.dispose();
    const segs = 64;
    const arcAngle = progress * Math.PI * 2;
    this._progressRing.geometry = new RingGeometry(
      radius - 0.5, radius + 0.5, segs, 1, 0, arcAngle
    );
    const scaleVal = this.state === 'HOLDING_ENTER' ? 1 : this._orbitRadius / radius;
    this._progressRing.scale.setScalar(scaleVal);

    // Color shifts from blue to cyan to white as it fills
    const hue = 200 - progress * 20;
    const lightness = 50 + progress * 30;
    this._progressRing.material.color.setHSL(hue / 360, 0.8, lightness / 100);
    this._progressRing.material.opacity = 0.5 + progress * 0.4;
  }

  _spawnOrbitParticle(pos) {
    // Simple DOM-free particle using Three.js points would be ideal,
    // but for quick implementation we reuse the BallTrail system.
    // The BallTrail is already active during orbit and will pick up
    // the ball position naturally.
  }

  dispose() {
    this.reset();
    if (this._promptEl && this._promptEl.parentNode) {
      this._promptEl.parentNode.removeChild(this._promptEl);
    }
    if (this._ringMesh) {
      this._ringMesh.geometry.dispose();
      this._ringMesh.material.dispose();
    }
    if (this._progressRing) {
      this._progressRing.geometry.dispose();
      this._progressRing.material.dispose();
    }
  }
}
