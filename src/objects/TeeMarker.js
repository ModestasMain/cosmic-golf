// ============================================================
// TeeMarker.js — shows ball starting position for each hole
// ============================================================

import {
  Mesh, CylinderGeometry, MeshBasicMaterial,
  Group, Color, AdditiveBlending,
  TorusGeometry,
} from 'three';
import { HOLE } from '../core/Constants.js';

export class TeeMarker {
  constructor(position, color = 0x00ff88) {
    this.position = position.clone();
    this.color = color;

    this.group = new Group();
    this.group.position.copy(position);

    this._buildMesh();
  }

  _buildMesh() {
    // Flat disc marker
    const discGeo = new CylinderGeometry(HOLE.TEE_RADIUS, HOLE.TEE_RADIUS, 0.2, 20);
    const discMat = new MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.7,
    });
    this.disc = new Mesh(discGeo, discMat);
    this.group.add(this.disc);

    // Ring around tee
    const ringGeo = new TorusGeometry(HOLE.TEE_RADIUS * 1.5, 0.12, 6, 24);
    const col = new Color(this.color);
    const ringMat = new MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.ring = new Mesh(ringGeo, ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.group.add(this.ring);
  }

  addToScene(scene) {
    scene.add(this.group);
  }

  removeFromScene(scene) {
    scene.remove(this.group);
    this.dispose();
  }

  dispose() {
    this.disc.geometry.dispose();
    this.disc.material.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
