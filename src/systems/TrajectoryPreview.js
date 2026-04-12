// ============================================================
// TrajectoryPreview.js — dotted trajectory line preview
// Simulates ball path using GravitySystem
// ============================================================

import {
  BufferGeometry, BufferAttribute, Points, PointsMaterial, AdditiveBlending, Vector3,
} from 'three';
import { simulateTrajectory } from './GravitySystem.js';
import { AIM } from '../core/Constants.js';

export class TrajectoryPreview {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this._buildMesh();
  }

  _buildMesh() {
    const maxPoints = AIM.TRAJECTORY_STEPS;

    // Create buffer geometry with max capacity
    const positions = new Float32Array(maxPoints * 3);
    const colors = new Float32Array(maxPoints * 3);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new PointsMaterial({
      size: 2.0,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      vertexColors: true,
    });

    this.points = new Points(this.geometry, this.material);
    this.points.visible = false;
    this.points.renderOrder = 999;
    this.scene.add(this.points);
  }

  /**
   * Update trajectory preview.
   * @param {Vector3} ballPos
   * @param {Vector3} shotVelocity  velocity to simulate (already scaled by power)
   * @param {Array}   planets
   */
  update(ballPos, shotVelocity, planets) {
    const trajectory = simulateTrajectory(
      ballPos,
      shotVelocity,
      planets,
      AIM.TRAJECTORY_STEPS,
      AIM.TRAJECTORY_DT,
    );

    const positions = this.geometry.attributes.position.array;
    const colors    = this.geometry.attributes.color.array;
    const total     = trajectory.length;

    const STEP = 3;
    let count = 0;
    for (let i = 0; i < total; i += STEP) {
      if (count >= AIM.TRAJECTORY_STEPS) break;
      const p = trajectory[i];

      positions[count * 3]     = p.x;
      positions[count * 3 + 1] = p.y;
      positions[count * 3 + 2] = p.z;

      const t     = count / Math.max(1, Math.floor(total / STEP) - 1);
      const alpha = Math.pow(1.0 - t, 0.6);
      colors[count * 3]     = alpha * 0.5;
      colors[count * 3 + 1] = alpha * 0.9;
      colors[count * 3 + 2] = alpha * 1.0;
      count++;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate    = true;
    this.geometry.setDrawRange(0, count);

    this.points.visible = this.visible;
  }

  show() {
    this.visible = true;
    this.points.visible = true;
  }

  hide() {
    this.visible = false;
    this.points.visible = false;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
