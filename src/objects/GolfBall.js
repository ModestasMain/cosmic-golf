// ============================================================
// GolfBall.js — styleable golf ball with canvas textures
// ============================================================

import {
  Mesh, SphereGeometry, MeshBasicMaterial,
  Vector3, Group, SRGBColorSpace,
} from 'three';
import { BALL } from '../core/Constants.js';
import { BallTrail } from '../effects/BallTrail.js';
import { buildBallStyle } from './BallStyles.js';
import { eventBus, Events } from '../core/EventBus.js';

const SHARED_GEO = new SphereGeometry(BALL.RADIUS, 32, 24);

export const SHAKE_CONFIG = {
  amplitude:  0.06,  // multiplier on BALL.RADIUS
  freqX:     38.0,
  freqY:     41.5,
  freqZ:     35.8,
};

export class GolfBall {
  constructor(color = 0xffffff, trailColor = null, styleId = 'basketball') {
    this.color       = color;
    this._trailColor = trailColor ?? color;
    this._styleId    = styleId;
    this.position    = new Vector3();
    this.velocity    = new Vector3();
    this._t          = 0;
    this.trail       = null;

    this.group = new Group();
    this._chargePower = 0;
    this._albedoTex  = null;
    this._buildMesh();
    this._unsubStyle = eventBus.on(Events.BALL_STYLE_CHANGED, ({ styleId }) => this.setStyle(styleId));
  }

  async _buildMesh() {
    this.mesh = new Mesh(SHARED_GEO, new MeshBasicMaterial({
      color:               0xffffff,
      polygonOffset:       true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits:  -4,
    }));
    this.mesh.renderOrder = 100;
    this.group.add(this.mesh);

    const style = await buildBallStyle(this._styleId);
    this._applyStyle(style);
  }

  _applyStyle(style) {
    if (this._albedoTex) this._albedoTex.dispose();

    style.albedo.colorSpace = SRGBColorSpace;
    style.albedo.needsUpdate = true;

    this._albedoTex = style.albedo;
    this.mesh.material.map = style.albedo;
    this.mesh.material.needsUpdate = true;
  }

  update(dt) {
    this._t += dt;
    if (this.trail) this.trail.update(this.position, dt);

    const t     = this._t;

    const shakeAmp = this._chargePower * BALL.RADIUS * SHAKE_CONFIG.amplitude;
    if (shakeAmp > 0.001) {
      const sx = Math.sin(t * SHAKE_CONFIG.freqX) * shakeAmp;
      const sy = Math.sin(t * SHAKE_CONFIG.freqY + 1.2) * shakeAmp * 0.7;
      const sz = Math.cos(t * SHAKE_CONFIG.freqZ + 2.4) * shakeAmp;
      this.group.position.set(this.position.x + sx, this.position.y + sy, this.position.z + sz);
    } else {
      this.group.position.copy(this.position);
    }
  }

  setPower(p) {
    this._chargePower = Math.max(0, Math.min(1, p));
    if (this.trail) this.trail.setChargeLevel(this._chargePower);
  }

  setPosition(pos) {
    this.position.copy(pos);
    this.group.position.copy(pos);
  }

  setVelocity(vel) { this.velocity.copy(vel); }

  async setStyle(styleId) {
    this._styleId = styleId;
    const style = await buildBallStyle(styleId);
    this._applyStyle(style);
  }

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

  addToScene(scene) {
    scene.add(this.group);
    this.trail = new BallTrail(scene, this._trailColor);
  }

  removeFromScene(scene) {
    if (this.trail) { this.trail.dispose(); this.trail = null; }
    scene.remove(this.group);
    this.dispose();
  }

  dispose() {
    if (this._unsubStyle) { this._unsubStyle(); this._unsubStyle = null; }
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (this._albedoTex) this._albedoTex.dispose();
  }
}
