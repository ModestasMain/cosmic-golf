// ============================================================
// GravityField.js — subtle gravity pulse rings around a planet
// Two rings, single equatorial plane, drifting inward.
// ============================================================

import { Mesh, TorusGeometry, MeshBasicMaterial, Group, Color, AdditiveBlending } from 'three';

export class GravityField {
  constructor(position, radius, mass, color) {
    this.group = new Group();
    this.group.position.copy(position);

    const col    = new Color(color);
    const fieldR = radius * 2.2 + Math.cbrt(mass) * 0.8;

    this._rings = [];

    for (let i = 0; i < 2; i++) {
      const geo = new TorusGeometry(1, 0.025, 8, 64);
      const mat = new MeshBasicMaterial({
        color:       col,
        transparent: true,
        opacity:     0,
        depthWrite:  false,
        blending:    AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2; // lie flat in equatorial plane
      this.group.add(mesh);

      this._rings.push({
        mesh,
        phase: i * 0.5,   // two rings, half a cycle apart
        minR:  radius * 1.3,
        maxR:  fieldR,
        speed: 0.2,
      });
    }
  }

  update(dt) {
    for (const r of this._rings) {
      r.phase = (r.phase + dt * r.speed) % 1;
      const scale = r.maxR + (r.minR - r.maxR) * r.phase;
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = Math.sin(r.phase * Math.PI) * 0.06;
    }
  }

  addToScene(scene)      { scene.add(this.group); }
  removeFromScene(scene) { scene.remove(this.group); this.dispose(); }

  dispose() {
    for (const r of this._rings) {
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    }
  }
}
