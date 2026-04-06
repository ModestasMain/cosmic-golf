// ============================================================
// GhostBall.js — visual ball for remote players
// Simpler than GolfBall: colored glow sphere, no dimple texture.
// ============================================================

import { Mesh, SphereGeometry, MeshStandardMaterial, Color, Group, PointLight, Vector3 } from 'three';
import { BALL } from '../core/Constants.js';

export class GhostBall {
  constructor(color = 0xff6464, name = '') {
    this.position = new Vector3();
    this.velocity = new Vector3();
    this.group    = new Group();
    this._name    = name;

    const col = new Color(color);
    const geo = new SphereGeometry(BALL.RADIUS, 20, 14);
    const mat = new MeshStandardMaterial({
      color:             col,
      emissive:          col,
      emissiveIntensity: 0.55,
      roughness:         0.5,
      metalness:         0.0,
      transparent:       true,
      opacity:           0.92,
      depthWrite:        false,
    });

    this.mesh = new Mesh(geo, mat);
    this.mesh.renderOrder = 99;
    this.mesh.material.depthTest = false;
    this.group.add(this.mesh);

    // Colored point light so ghost ball illuminates nearby planets
    this.light = new PointLight(color, 0.4, 12);
    this.group.add(this.light);
  }

  setPosition(pos) {
    this.position.copy(pos);
    this.group.position.copy(pos);
  }

  setVelocity(vel) { this.velocity.copy(vel); }

  syncMesh() { this.group.position.copy(this.position); }

  updateSpin(dt) {
    const speed = this.velocity.length();
    if (speed > 0.5) {
      this.mesh.rotateOnWorldAxis(this.velocity.clone().normalize(), speed * dt * 0.4);
    }
  }

  addToScene(scene)    { scene.add(this.group); }
  removeFromScene(scene) { scene.remove(this.group); this.dispose(); }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
