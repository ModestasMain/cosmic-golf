// ============================================================
// BallTrail.js — glowing comet trail behind the ball
// ============================================================

import {
  BufferGeometry, Float32BufferAttribute, PointsMaterial,
  Points, AdditiveBlending,
} from 'three';

const MAX_POINTS = 80;

export class BallTrail {
  constructor(scene) {
    this.positions = new Float32Array(MAX_POINTS * 3);
    this.colors    = new Float32Array(MAX_POINTS * 3);
    this.sizes     = new Float32Array(MAX_POINTS);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color',    new Float32BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new PointsMaterial({
      size:          3.0,
      vertexColors:  true,
      transparent:   true,
      depthWrite:    false,
      depthTest:     false,
      blending:      AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new Points(this.geometry, this.material);
    this.points.renderOrder = 98; // just behind ball (100)
    scene.add(this.points);

    this._history = [];
    this._active  = false;
  }

  setActive(active) {
    this._active = active;
    if (!active) {
      this._history = [];
      this.geometry.setDrawRange(0, 0);
    }
  }

  update(ballPosition) {
    if (!this._active) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    this._history.unshift({ x: ballPosition.x, y: ballPosition.y, z: ballPosition.z });
    if (this._history.length > MAX_POINTS) this._history.pop();

    const n = this._history.length;
    for (let i = 0; i < n; i++) {
      const t = 1 - i / n; // 1 = newest (head), 0 = oldest (tail)
      const eased = Math.pow(t, 0.5); // sqrt fade — stays bright longer

      this.positions[i * 3]     = this._history[i].x;
      this.positions[i * 3 + 1] = this._history[i].y;
      this.positions[i * 3 + 2] = this._history[i].z;

      // Head: bright white-blue → tail: cyan → deep blue → gone
      this.colors[i * 3]     = eased * 0.6 + (1 - eased) * 0.1; // R
      this.colors[i * 3 + 1] = eased * 0.9 + (1 - eased) * 0.3; // G
      this.colors[i * 3 + 2] = eased * 1.0;                       // B
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate    = true;
    this.geometry.setDrawRange(0, n);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    if (this.points.parent) this.points.parent.remove(this.points);
  }
}
